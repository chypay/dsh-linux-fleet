import type { ToolDeps } from './shared.js'
import { createServerListTool } from './server-list.js'
import { createSysInfoTool } from './sys-info.js'
import { createExecCmdTool } from './exec-cmd.js'
import { createServiceManageTool } from './service-manage.js'
import { createFileOpsTool } from './file-ops.js'

/** 一次性注册五个工具；注册随插件 fiber 生命周期自动撤销 */
export function registerAllTools(ctx: any, deps: ToolDeps): void {
  const tools = [
    createServerListTool(deps),
    createSysInfoTool(deps),
    createExecCmdTool(deps),
    createServiceManageTool(deps),
    createFileOpsTool(deps),
  ]
  for (const definition of tools) {
    ctx.tools.register(definition)
  }
}
