import { guarded, stringOutput, tool, type ToolDeps } from './shared.js'

export function createServerListTool(deps: ToolDeps) {
  return tool({
    name: 'linux_server_list',
    description: '列出当前已配置的所有远程 Linux 服务器：别名、主机、端口、用户名与私钥路径。在调用其它 linux_* 工具前，先用本工具确认要使用的服务器别名。',
    parameters: {},
    output: stringOutput(),
    async execute() {
      return guarded(deps, async () => {
        const servers = deps.store.list()
        if (servers.length === 0) {
          return '当前没有配置任何 Linux 服务器。请在 DSH Web 设置的「Linux 服务器」页添加，或在 cordis.patch.yml 的 config.servers 中配置。'
        }
        const lines = servers.map((s) =>
          `- ${s.name}: ${s.user}@${s.host}:${s.port}（私钥: ${s.privateKeyPath}）`,
        )
        return `已配置 ${servers.length} 台 Linux 服务器：\n${lines.join('\n')}`
      })
    },
  })
}
