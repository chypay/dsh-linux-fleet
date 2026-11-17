import type { Config, ServerStore } from './config.js'
import type { SshPool } from './ssh-pool.js'

interface RouteDeps {
  config: Config
  store: ServerStore
  pool: SshPool
  ready: Promise<void>
}

const BASE = '/api/linux-fleet/'

function send(res: any, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function readBody(req: any, limit = 1_048_576): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return
      data += chunk.toString('utf8')
      if (data.length > limit) {
        tooLarge = true
        reject(new Error('请求体过大'))
      }
    })
    req.on('end', () => { if (!tooLarge) resolve(data) })
    req.on('error', reject)
  })
}

/** Host 半部：给 Web 设置页提供服务器 CRUD 与 SSH 连通性测试 */
export function registerHostRoutes(ctx: any, deps: RouteDeps): void {
  ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    handler: async (req: any, res: any) => {
      try {
        // 沿用 DSH 的连接信任校验，防止 DNS rebinding / 跨站请求
        if (ctx.connection?.requestRejection?.(req)) {
          send(res, 403, { ok: false, error: '请求未通过 DSH 连接校验' })
          return
        }
        await deps.ready

        const url = new URL(req.url || '/', 'http://localhost')
        const sub = url.pathname.slice(BASE.length).replace(/^\/+/, '')
        const method = (req.method || 'GET').toUpperCase()

        let body: Record<string, any> = {}
        if (method === 'POST' || method === 'PUT') {
          const raw = await readBody(req)
          body = raw ? JSON.parse(raw) : {}
          if (typeof body !== 'object' || body === null) throw new Error('请求体必须是 JSON 对象')
        }

        if (method === 'GET' && sub === 'health') {
          send(res, 200, { ok: true, service: 'dsh-linux-fleet' })
          return
        }

        if (method === 'GET' && sub === 'servers') {
          send(res, 200, { ok: true, servers: deps.store.list(), dataFile: deps.store.filePath })
          return
        }

        if (method === 'POST' && sub === 'servers') {
          const server = await deps.store.add(body)
          send(res, 200, { ok: true, server })
          return
        }

        if (method === 'POST' && sub === 'servers/update') {
          const server = await deps.store.update(String(body.originalName ?? body.name ?? ''), body)
          send(res, 200, { ok: true, server })
          return
        }

        if (method === 'POST' && sub === 'servers/delete') {
          await deps.store.remove(String(body.name ?? ''))
          send(res, 200, { ok: true })
          return
        }

        if (method === 'POST' && sub === 'test') {
          const server = deps.store.require(String(body.name ?? ''))
          const started = Date.now()
          const result = await deps.pool.exec(server, 'echo DSH_LINUX_FLEET_OK', {
            timeout: deps.config.connectTimeout + 3000,
          })
          const ok = result.exitCode === 0 && result.stdout.includes('DSH_LINUX_FLEET_OK')
          send(res, 200, {
            ok,
            name: server.name,
            latencyMs: Date.now() - started,
            exitCode: result.exitCode,
            error: ok ? undefined : result.stderr.trim() || '未收到期望的 SSH 响应',
          })
          return
        }

        send(res, 404, { ok: false, error: `未知接口: ${method} ${sub}` })
      } catch (err) {
        send(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  })
}
