import { guarded, stringOutput, tool, type ToolDeps } from './shared.js'

const ACTIONS = ['status', 'start', 'stop', 'restart', 'logs'] as const
type Action = (typeof ACTIONS)[number]

/** systemd 单元名白名单，防止拼接进命令造成注入 */
const SERVICE_NAME_RE = /^[A-Za-z0-9@._:\-\\]{1,128}$/

function buildCommand(action: Action, service: string, lines: number): string {
  switch (action) {
    case 'status':
      return `systemctl status ${service} --no-pager -l`
    case 'start':
      return `systemctl start ${service} && systemctl status ${service} --no-pager -l | head -20`
    case 'stop':
      return `systemctl stop ${service} && systemctl is-active ${service} || true`
    case 'restart':
      return `systemctl restart ${service} && systemctl status ${service} --no-pager -l | head -20`
    case 'logs':
      return `journalctl -u ${service} -n ${lines} --no-pager`
  }
}

export function createServiceManageTool(deps: ToolDeps) {
  return tool({
    name: 'linux_service_manage',
    description: '通过 systemctl 管理指定远程服务器上的服务：查询 status、start、stop、restart，或用 logs 获取最近 50 行 journalctl 日志。',
    parameters: {
      server: {
        type: 'string',
        required: true,
        description: '服务器别名',
      },
      service: {
        type: 'string',
        required: true,
        description: 'systemd 服务名，例如 nginx.service、docker',
      },
      action: {
        type: 'string',
        required: true,
        description: '操作：status | start | stop | restart | logs',
      },
      lines: {
        type: 'number',
        description: 'action=logs 时返回的日志行数，默认 50，最大 500',
      },
    },
    output: stringOutput(),
    async execute(
      args: { server: string; service: string; action: string; lines?: number },
      exec?: { signal?: AbortSignal },
    ) {
      return guarded(deps, async () => {
        const action = String(args.action ?? 'status') as Action
        if (!ACTIONS.includes(action)) {
          return `ERROR: 不支持的 action "${args.action}"，可选值：${ACTIONS.join(' | ')}`
        }
        const service = String(args.service ?? '').trim()
        if (!SERVICE_NAME_RE.test(service)) {
          return 'ERROR: service 名不合法，只允许字母、数字、@ . _ : - 和反斜杠'
        }
        const lines = Math.min(500, Math.max(1, Math.floor(Number(args.lines ?? 50) || 50)))
        const server = deps.store.require(args.server)
        const command = buildCommand(action, service, lines)
        const result = await deps.pool.exec(server, command, { signal: exec?.signal })

        const parts = [
          `服务器: ${server.name} | 服务: ${service} | 操作: ${action}`,
          `退出码: ${result.exitCode}`,
          `--- 输出 ---\n${result.stdout || '(空)'}`,
        ]
        if (result.stderr.trim()) parts.push(`--- stderr ---\n${result.stderr.trim()}`)
        return parts.join('\n')
      })
    },
  })
}
