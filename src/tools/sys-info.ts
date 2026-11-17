import { guarded, stringOutput, tool, type ToolDeps } from './shared.js'

/**
 * 一条只读命令拿到系统信息。/proc/stat 采样两次计算 CPU 使用率，
 * 兼容大多数发行版；各段失败时继续输出其它段。
 */
const SYS_INFO_SCRIPT = String.raw`echo "=== 系统 ==="
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s
echo "=== 运行时间 ==="
uptime -p 2>/dev/null || awk '{printf "up %.1f days\n", $1/86400}' /proc/uptime
echo "=== 负载 ==="
uptime
echo "=== CPU 使用率 ==="
read _ u1 n1 s1 i1 w1 q1 t1 x1 y1 z1 </proc/stat; sleep 1; read _ u2 n2 s2 i2 w2 q2 t2 x2 y2 z2 </proc/stat; T1=$((u1+n1+s1+i1+w1+q1+t1+x1+y1+z1)); T2=$((u2+n2+s2+i2+w2+q2+t2+x2+y2+z2)); I1=$((i1+w1)); I2=$((i2+w2)); DT=$((T2-T1)); DI=$((I2-I1)); if [ "$DT" -gt 0 ]; then awk -v d="$DT" -v i="$DI" 'BEGIN{printf "%.1f%%\n", 100*(d-i)/d}'; else echo "N/A"; fi
echo "=== 内存 ==="
free -h
echo "=== 磁盘 ==="
df -h`

export function createSysInfoTool(deps: ToolDeps) {
  return tool({
    name: 'linux_sys_info',
    description: '一键获取指定远程 Linux 服务器的系统信息：CPU 使用率、内存占用、磁盘空间(df -h)、系统负载(uptime)和运行时间。返回原始文本报告。',
    parameters: {
      server: {
        type: 'string',
        required: true,
        description: '服务器别名，可用 linux_server_list 查看',
      },
      timeout: {
        type: 'number',
        description: '命令超时毫秒数，可选，默认使用插件配置',
      },
    },
    output: stringOutput(),
    async execute(args: { server: string; timeout?: number }, exec?: { signal?: AbortSignal }) {
      return guarded(deps, async () => {
        const server = deps.store.require(args.server)
        const result = await deps.pool.exec(server, SYS_INFO_SCRIPT, {
          signal: exec?.signal,
          timeout: args.timeout,
        })
        const parts = [
          `服务器: ${server.name} (${server.user}@${server.host}:${server.port})`,
          result.stdout.trim(),
        ]
        if (result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trim()}`)
        parts.push(`[耗时 ${result.durationMs}ms，退出码 ${result.exitCode}]`)
        return parts.join('\n')
      })
    },
  })
}
