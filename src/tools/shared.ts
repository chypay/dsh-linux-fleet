// @ts-ignore - 由 DSH 运行时提供
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config, ServerStore } from '../config.js'
import type { SshPool } from '../ssh-pool.js'
import type { createCommandGuard } from '../security.js'

export interface ToolDeps {
  config: Config
  store: ServerStore
  pool: SshPool
  guard: ReturnType<typeof createCommandGuard>
  ready: Promise<void>
  ctx: any
}

/** 所有工具共用的字符串输出契约（canonical value 是字符串，render 保持纯函数） */
export function stringOutput() {
  return {
    schema: { type: 'string' as const },
    render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 统一异常边界：等待存储初始化，捕获所有异常并返回可读错误文本，
 * 保证任何失败都不会让插件或 Agent 崩溃。
 */
export async function guarded(deps: ToolDeps, fn: () => Promise<string>): Promise<string> {
  try {
    await deps.ready
    return await fn()
  } catch (err) {
    return `ERROR: ${errorMessage(err)}`
  }
}

/** 工具入口的 defineTool 包装，避免每个文件重复 import */
export function tool(definition: any): any {
  return defineTool(definition)
}
