/**
 * 高危命令黑名单。
 * 只作用于 linux_exec_cmd 这类自由命令入口；受控工具（systemctl/journalctl 等）
 * 使用白名单动作，不走这里。
 */

export interface GuardResult {
  blocked: boolean
  reason?: string
  pattern?: string
}

interface Rule {
  pattern: string
  reason: string
}

/** 内置规则：覆盖删除根目录、关机重启、格式化、分区、裸设备写入等 */
const BUILTIN_RULES: Rule[] = [
  {
    pattern: String.raw`\brm\s+-(?=[a-zA-Z]*[rR])(?=[a-zA-Z]*[fF])[a-zA-Z]+\s+(\/\*|\/|\*|~|--no-preserve-root)(\s|$)`,
    reason: '递归强制删除根目录、家目录或通配符（如 rm -rf /）',
  },
  {
    pattern: String.raw`\b(shutdown|reboot|halt|poweroff|init\s+[06])\b`,
    reason: '关机或重启主机',
  },
  {
    pattern: String.raw`\bmkfs(\.[a-z0-9]+)?\b`,
    reason: '格式化文件系统（mkfs）',
  },
  {
    pattern: String.raw`\b(fdisk|parted|gdisk|sfdisk)\b`,
    reason: '修改磁盘分区表',
  },
  {
    pattern: String.raw`\bdd\s+if=|\bdd\s+[^;|]{0,300}\bof=/dev/`,
    reason: 'dd 裸设备读写',
  },
  {
    pattern: String.raw`>\s*/dev/(sd|nvme|vd|hd|xvd|loop)[a-z0-9]*\b`,
    reason: '直接写块设备',
  },
  {
    pattern: String.raw`\bchmod\s+-(?=[a-zA-Z]*[rR])[a-zA-Z]*\s+777\s+(\/\*|\/|\*|~)(\s|$)`,
    reason: '递归放开根目录权限',
  },
  {
    pattern: String.raw`\bkill\s+-[a-zA-Z0-9]*\s+-1\b`,
    reason: '向全部进程发送信号',
  },
  {
    pattern: String.raw`:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;`,
    reason: 'fork 炸弹',
  },
  {
    pattern: String.raw`(curl|wget)\b[^|]{0,500}\|\s*(sudo\s+)?(ba|z|da|k)?sh\b`,
    reason: '下载并直接执行远程脚本',
  },
  {
    pattern: String.raw`\b(iptables\s+-F|nft\s+flush|ufw\s+disable)\b`,
    reason: '清空或关闭防火墙规则',
  },
]

/**
 * 把一条命令拆成可独立检查的片段，防止用 ; && || | 换行绕过黑名单。
 */
function splitSegments(command: string): string[] {
  return command
    .split(/(?:&&|\|\||[;|\n])/)
    .map((segment) => {
      let text = segment.split('#')[0].trim()
      // 去掉 sudo / env 前缀
      text = text.replace(/^(?:sudo\s+|env\s+)+/i, '')
      // 展开常见的 sh -c "..." 包装
      const wrapped = text.match(/^(?:bash|sh|zsh|dash)\s+-c\s+['"]([\s\S]+)['"]$/i)
      if (wrapped) text = wrapped[1]
      return text.trim()
    })
    .filter(Boolean)
}

export function createCommandGuard(extraPatterns: string[] = []): { check(command: string): GuardResult } {
  const rules: Rule[] = [
    ...BUILTIN_RULES,
    ...extraPatterns.map((pattern) => ({ pattern, reason: '命中自定义高危命令规则' })),
  ].map((rule) => ({ ...rule }))

  const compiled: Array<{ re: RegExp; reason: string; pattern: string }> = []
  for (const rule of rules) {
    try {
      compiled.push({ re: new RegExp(rule.pattern, 'i'), reason: rule.reason, pattern: rule.pattern })
    } catch {
      // 非法自定义正则直接忽略，避免插件崩掉
    }
  }

  return {
    check(command: string): GuardResult {
      if (!command || !command.trim()) return { blocked: false }
      for (const segment of splitSegments(command)) {
        for (const rule of compiled) {
          if (rule.re.test(segment)) {
            return { blocked: true, reason: rule.reason, pattern: rule.pattern }
          }
        }
      }
      return { blocked: false }
    },
  }
}

/** 上传文件时禁止覆盖的关键系统文件 */
const PROTECTED_UPLOAD_PATHS = [
  '/etc/shadow',
  '/etc/gshadow',
  '/etc/sudoers',
  '/etc/ssh/sshd_config',
]

export function checkUploadPath(path: string): string | null {
  const normalized = String(path ?? '').replace(/\\/g, '/')
  for (const protectedPath of PROTECTED_UPLOAD_PATHS) {
    if (normalized === protectedPath || normalized.startsWith(`${protectedPath}/`)) {
      return `拒绝上传：${protectedPath} 属于受保护的系统文件`
    }
  }
  if (/\/\.ssh\/authorized_keys(\/|$)/i.test(normalized)) {
    return '拒绝上传：不允许覆盖 ~/.ssh/authorized_keys'
  }
  return null
}
