// @ts-ignore - 由 DSH 运行时提供 Context 类型
import type { Context } from '@deepseek-ai/cordis'
import { Config, ServerStore, resolveDataFile, type Config as ConfigType } from './config.js'
import { createCommandGuard } from './security.js'
import { SshPool } from './ssh-pool.js'
import { registerAllTools } from './tools/index.js'
import { registerHostRoutes } from './routes.js'

export { Config }
export const name = 'dsh-linux-fleet'
export const inject = ['tools', 'webServer', 'connection']

export function apply(ctx: Context, config: ConfigType): void {
  const store = new ServerStore(config, resolveDataFile(config))
  const ready = store.init()

  const pool = new SshPool({
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    idleTimeout: 5 * 60_000,
    maxOutputBytes: config.commandMaxBytes,
  })

  const guard = createCommandGuard(config.extraBlockedPatterns)

  registerAllTools(ctx, { config, store, pool, guard, ready, ctx })
  registerHostRoutes(ctx, { config, store, pool, ready })

  void ready
    .then(() => ctx.logger?.info?.(`[dsh-linux-fleet] 已加载，${store.list().length} 台服务器，清单文件: ${store.filePath}`))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      ctx.logger?.warn?.(`[dsh-linux-fleet] 服务器清单加载失败: ${message}`)
    })

  // 插件卸载时关闭全部 SSH 连接与空闲清理定时器
  ctx.effect(() => () => pool.dispose())
}
