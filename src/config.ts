// @ts-ignore - 由 DSH 运行时提供 Schemastery 类型
import Schema from '@deepseek-ai/schemastery'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'

/** 一台远程 Linux 服务器的连接信息 */
export interface ServerConfig {
  /** 别名，工具调用时用它指代服务器 */
  name: string
  host: string
  port: number
  user: string
  /** 本机上的 SSH 私钥绝对路径 */
  privateKeyPath: string
}

/** 插件配置（由 Cordis Schema 校验并填充默认值） */
export interface Config {
  servers: ServerConfig[]
  /** 运行时服务器清单文件；留空则使用 $DSH_HOME/linux-fleet.json */
  dataFile: string
  connectTimeout: number
  commandTimeout: number
  /** 单条命令 stdout/stderr 各自的最大保留字节数 */
  commandMaxBytes: number
  /** true = 每次启动都用 Cordis 配置覆盖运行时清单 */
  preferConfig: boolean
  /** 在内置黑名单之外追加的自定义高危命令正则 */
  extraBlockedPatterns: string[]
}

export const Config = Schema.object({
  servers: Schema.array(Schema.object({
    name: Schema.string().required(),
    host: Schema.string().required(),
    port: Schema.number().default(22),
    user: Schema.string().default('root'),
    privateKeyPath: Schema.string().required(),
  })).default([]),
  dataFile: Schema.string().default(''),
  connectTimeout: Schema.number().default(15000),
  commandTimeout: Schema.number().default(30000),
  commandMaxBytes: Schema.number().default(131072),
  preferConfig: Schema.boolean().default(false),
  extraBlockedPatterns: Schema.array(Schema.string()).default([]),
})

/** 解析运行时清单的文件路径 */
export function resolveDataFile(config: Config): string {
  if (config.dataFile) return resolve(config.dataFile)
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(dshHome, 'linux-fleet.json')
}

/** 校验单台服务器的字段，避免注入与无效配置 */
export function validateServer(input: Partial<ServerConfig>): ServerConfig {
  const name = String(input.name ?? '').trim()
  const host = String(input.host ?? '').trim()
  const user = String(input.user ?? 'root').trim()
  const port = Number(input.port ?? 22)
  const privateKeyPath = String(input.privateKeyPath ?? '').trim()

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) {
    throw new Error('服务器别名只能包含字母、数字、点、下划线和连字符（1-64 位）')
  }
  if (!host) throw new Error('host 不能为空')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('port 必须是 1-65535 之间的整数')
  }
  if (!user) throw new Error('user 不能为空')
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(user)) {
    throw new Error('user 含有非法字符')
  }
  if (!privateKeyPath) throw new Error('privateKeyPath 不能为空')
  if (!isAbsolute(privateKeyPath)) {
    throw new Error('privateKeyPath 必须是绝对路径，例如 C:/Users/me/.ssh/id_ed25519 或 /home/me/.ssh/id_ed25519')
  }

  return { name, host, port, user, privateKeyPath }
}

/**
 * 服务器清单运行时存储。
 * Cordis 配置作为首次启动的种子；之后 Web UI 的增删改查落盘到 dataFile。
 */
export class ServerStore {
  private servers: ServerConfig[] = []

  constructor(private config: Config, private file: string) {}

  get filePath(): string {
    return this.file
  }

  async init(): Promise<void> {
    let fromFile: ServerConfig[] | null = null
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'))
      if (Array.isArray(parsed?.servers)) {
        fromFile = parsed.servers.map((item: Partial<ServerConfig>) => validateServer(item))
      }
    } catch {
      // 文件不存在或损坏时回落到 Cordis 配置
    }

    if (this.config.preferConfig || fromFile === null) {
      this.servers = this.config.servers.map((item) => validateServer(item))
      await this.persist()
    } else {
      this.servers = fromFile
    }
  }

  list(): ServerConfig[] {
    return this.servers.map((item) => ({ ...item }))
  }

  find(name: string): ServerConfig | undefined {
    return this.servers.find((item) => item.name === name)
  }

  /** 工具内部使用：找不到时给出可用别名，避免模型反复猜 */
  require(name: string): ServerConfig {
    const server = this.find(String(name ?? '').trim())
    if (server) return server
    const names = this.servers.map((item) => item.name).join(', ') || '（无）'
    throw new Error(`找不到服务器别名 "${name}"。当前可用别名：${names}`)
  }

  async add(input: Partial<ServerConfig>): Promise<ServerConfig> {
    const server = validateServer(input)
    if (this.find(server.name)) throw new Error(`服务器别名 "${server.name}" 已存在`)
    this.servers.push(server)
    await this.persist()
    return { ...server }
  }

  async update(name: string, patch: Partial<ServerConfig>): Promise<ServerConfig> {
    const index = this.servers.findIndex((item) => item.name === name)
    if (index < 0) throw new Error(`找不到服务器别名 "${name}"`)
    const merged = validateServer({ ...this.servers[index], ...patch })
    if (merged.name !== name && this.find(merged.name)) {
      throw new Error(`服务器别名 "${merged.name}" 已存在`)
    }
    this.servers[index] = merged
    await this.persist()
    return { ...merged }
  }

  async remove(name: string): Promise<void> {
    const next = this.servers.filter((item) => item.name !== name)
    if (next.length === this.servers.length) throw new Error(`找不到服务器别名 "${name}"`)
    this.servers = next
    await this.persist()
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify({ version: 1, servers: this.servers }, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(tmp, this.file)
  }
}
