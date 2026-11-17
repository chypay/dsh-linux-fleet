// @ts-ignore - 由 @types/ssh2 提供，安装依赖后自动生效
import { Client } from 'ssh2'
// @ts-ignore
import type { ConnectConfig, SFTPWrapper } from 'ssh2'
import { readFile } from 'node:fs/promises'
import type { ServerConfig } from './config.js'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface PoolOptions {
  connectTimeout: number
  commandTimeout: number
  idleTimeout: number
  maxOutputBytes: number
}

interface PoolEntry {
  key: string
  client: Client | null
  connecting: Promise<Client> | null
  lastUsed: number
}

/** ssh2 连接池：按主机复用连接、并发去重、空闲回收，并统一处理超时与取消 */
export class SshPool {
  private entries = new Map<string, PoolEntry>()
  private sweeper: ReturnType<typeof setInterval>

  constructor(private opts: PoolOptions) {
    const period = Math.min(60_000, Math.max(1_000, Math.floor(opts.idleTimeout / 2)))
    this.sweeper = setInterval(() => this.sweep(), period)
    this.sweeper.unref?.()
  }

  private keyOf(server: ServerConfig): string {
    return `${server.user}@${server.host}:${server.port}:${server.privateKeyPath}`
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('操作已取消')
  }

  /** 获取可用连接；同一主机并发请求共享同一个 connect Promise */
  async acquire(server: ServerConfig, signal?: AbortSignal): Promise<Client> {
    this.throwIfAborted(signal)
    const key = this.keyOf(server)
    const hit = this.entries.get(key)
    if (hit?.client) {
      hit.lastUsed = Date.now()
      return hit.client
    }
    if (hit?.connecting) return hit.connecting

    const entry: PoolEntry = hit ?? { key, client: null, connecting: null, lastUsed: Date.now() }
    this.entries.set(key, entry)
    const pending = this.connect(server, key, signal)
    entry.connecting = pending

    try {
      const client = await pending
      entry.client = client
      entry.connecting = null
      entry.lastUsed = Date.now()
      if (signal?.aborted) {
        this.drop(key)
        throw new Error('操作已取消')
      }
      return client
    } catch (err) {
      if (entry.connecting === pending) this.entries.delete(key)
      throw err
    }
  }

  private async connect(server: ServerConfig, key: string, signal?: AbortSignal): Promise<Client> {
    const privateKey = await readFile(server.privateKeyPath).catch((err) => {
      throw new Error(`读取私钥 ${server.privateKeyPath} 失败：${err instanceof Error ? err.message : String(err)}`)
    })

    const client = new Client()
    // 常驻 error 监听：连接异步失败时不能让 Node 进程因未处理 error 而退出
    client.on('error', () => this.drop(key))
    client.on('close', () => this.entries.delete(key))

    const onAbort = () => {
      try { client.end() } catch { /* ignore */ }
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const timer = setTimeout(
          () => finish(new Error(`连接 ${server.name} (${server.host}:${server.port}) 超时（${this.opts.connectTimeout}ms）`)),
          this.opts.connectTimeout,
        )
        const finish = (err?: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          err ? reject(err) : resolve()
        }
        client.once('ready', () => finish())
        client.once('error', (err: Error) => finish(err))

        const config: ConnectConfig = {
          host: server.host,
          port: server.port,
          username: server.user,
          privateKey,
          readyTimeout: this.opts.connectTimeout,
          keepaliveInterval: 15_000,
          keepaliveCountMax: 3,
        }
        try {
          client.connect(config)
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)))
        }
      })
      return client
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** 执行命令：返回 stdout / stderr / 退出码，超时与取消会关闭远端通道 */
  async exec(
    server: ServerConfig,
    command: string,
    opts: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<ExecResult> {
    const started = Date.now()
    this.throwIfAborted(opts.signal)
    const client = await this.acquire(server, opts.signal)
    const timeout = opts.timeout && opts.timeout > 0 ? opts.timeout : this.opts.commandTimeout

    return new Promise<ExecResult>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: (() => void) | undefined

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (opts.signal && onAbort) opts.signal.removeEventListener('abort', onAbort)
      }
      const finish = (err?: Error, value?: ExecResult) => {
        if (settled) return
        settled = true
        cleanup()
        err ? reject(err) : resolve(value!)
      }

      client.exec(command, (err: Error | undefined, stream: any) => {
        if (err) {
          finish(err)
          return
        }

        let stdout = ''
        let stderr = ''
        let outTruncated = false
        let errTruncated = false
        const cap = this.opts.maxOutputBytes

        const append = (chunk: Buffer, kind: 'out' | 'err') => {
          const current = kind === 'out' ? stdout : stderr
          const room = Math.max(0, cap - current.length)
          if (room === 0) {
            kind === 'out' ? (outTruncated = true) : (errTruncated = true)
            return
          }
          const text = chunk.toString('utf8')
          if (kind === 'out') stdout += text.slice(0, room)
          else stderr += text.slice(0, room)
          if (text.length > room) {
            kind === 'out' ? (outTruncated = true) : (errTruncated = true)
          }
        }

        stream.on('data', (chunk: Buffer) => append(chunk, 'out'))
        stream.stderr.on('data', (chunk: Buffer) => append(chunk, 'err'))
        stream.on('error', (error: Error) => finish(error))
        stream.on('close', (code: number | null) => {
          finish(undefined, {
            stdout: stdout + (outTruncated ? '\n[输出已截断]' : ''),
            stderr: stderr + (errTruncated ? '\n[输出已截断]' : ''),
            exitCode: typeof code === 'number' ? code : -1,
            durationMs: Date.now() - started,
          })
        })

        timer = setTimeout(() => {
          try { stream.close() } catch { /* ignore */ }
          finish(new Error(`命令执行超时（${timeout}ms）`))
        }, timeout)

        onAbort = () => {
          try { stream.close() } catch { /* ignore */ }
          finish(new Error('操作已取消'))
        }
        if (opts.signal?.aborted) onAbort()
        else opts.signal?.addEventListener('abort', onAbort, { once: true })
      })
    })
  }

  /** 在一条 SFTP 会话中执行操作，结束后只关闭 SFTP 子通道，保留 SSH 连接 */
  async withSftp<T>(
    server: ServerConfig,
    fn: (sftp: SFTPWrapper) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.throwIfAborted(signal)
    const client = await this.acquire(server, signal)
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err: Error | undefined, wrapper: SFTPWrapper) => {
        err ? reject(err) : resolve(wrapper)
      })
    })
    try {
      return await fn(sftp)
    } finally {
      try { sftp.end() } catch { /* ignore */ }
    }
  }

  private sweep(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (!entry.connecting && entry.client && now - entry.lastUsed > this.opts.idleTimeout) {
        this.drop(key)
      }
    }
  }

  private drop(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    try { entry.client?.end() } catch { /* ignore */ }
    this.entries.delete(key)
  }

  dispose(): void {
    clearInterval(this.sweeper)
    for (const key of [...this.entries.keys()]) this.drop(key)
  }
}

/** SFTP 回调 API 的 Promise 封装 */
export function sftpReadFile(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(path, (err: Error | undefined, data: Buffer) => err ? reject(err) : resolve(data))
  })
}

export function sftpWriteFile(sftp: SFTPWrapper, path: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.writeFile(path, data, (err?: Error | null) => err ? reject(err) : resolve())
  })
}

export function sftpStat(sftp: SFTPWrapper, path: string): Promise<any | null> {
  return new Promise((resolve) => {
    sftp.stat(path, (err: Error | undefined, stats: any) => resolve(err ? null : stats))
  })
}

export function sftpRename(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (err?: Error | null) => err ? reject(err) : resolve())
  })
}
