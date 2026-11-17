import { guarded, stringOutput, tool, type ToolDeps } from './shared.js'

export function createExecCmdTool(deps: ToolDeps) {
  return tool({
    name: 'linux_exec_cmd',
    description: '在指定远程 Linux 服务器上执行 Shell 命令，返回 stdout、stderr 和退出码。高危命令（rm -rf /、shutdown、reboot、mkfs、fdisk 等）会被黑名单拒绝。',
    parameters: {
      server: {
        type: 'string',
        required: true,
        description: '服务器别名，可用 linux_server_list 查看',
      },
      command: {
        type: 'string',
        required: true,
        description: '要执行的 shell 命令原文',
      },
      timeout: {
        type: 'number',
        description: '命令超时毫秒数，可选',
      },
    },
    output: stringOutput(),
    async execute(
      args: { server: string; command: string; timeout?: number },
      exec?: { signal?: AbortSignal },
    ) {
      return guarded(deps, async () => {
        const command = String(args.command ?? '')
        if (!command.trim()) return 'ERROR: command 不能为空'

        const verdict = deps.guard.check(command)
        if (verdict.blocked) {
          return `拒绝执行：该命令命中高危黑名单（${verdict.reason}）。请改用受控工具或人工在服务器上操作。`
        }

        const server = deps.store.require(args.server)
        const result = await deps.pool.exec(server, command, {
          signal: exec?.signal,
          timeout: args.timeout,
        })

        const parts = [
          `服务器: ${server.name}`,
          `命令: ${command}`,
          `退出码: ${result.exitCode}`,
          `--- stdout ---\n${result.stdout || '(空)'}`,
          `--- stderr ---\n${result.stderr || '(空)'}`,
          `耗时: ${result.durationMs}ms`,
        ]
        return parts.join('\n')
      })
    },
  })
}
