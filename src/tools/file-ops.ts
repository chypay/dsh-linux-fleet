import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { checkUploadPath } from '../security.js'
import { sftpReadFile, sftpRename, sftpStat, sftpWriteFile } from '../ssh-pool.js'
import { guarded, stringOutput, tool, type ToolDeps } from './shared.js'

export function createFileOpsTool(deps: ToolDeps) {
  return tool({
    name: 'linux_file_ops',
    description: '远程文件操作：action=read 读取远程文件内容；action=upload 将本机文件通过 SFTP 上传到远程路径，上传前自动备份原文件为 .bak.<时间戳>。',
    parameters: {
      server: {
        type: 'string',
        required: true,
        description: '服务器别名',
      },
      action: {
        type: 'string',
        required: true,
        description: '操作：read | upload',
      },
      path: {
        type: 'string',
        required: true,
        description: '远程文件绝对路径',
      },
      localPath: {
        type: 'string',
        description: 'action=upload 时必填：本机要上传的文件绝对路径',
      },
      maxBytes: {
        type: 'number',
        description: 'action=read 时最多返回的字节数，默认 65536',
      },
    },
    output: stringOutput(),
    async execute(
      args: {
        server: string
        action: string
        path: string
        localPath?: string
        maxBytes?: number
      },
      exec?: { signal?: AbortSignal },
    ) {
      return guarded(deps, async () => {
        const action = String(args.action ?? '').toLowerCase()
        const remotePath = String(args.path ?? '').trim()
        if (action !== 'read' && action !== 'upload') {
          return 'ERROR: action 只支持 read 或 upload'
        }
        if (!remotePath || !remotePath.startsWith('/')) {
          return 'ERROR: 远程 path 必须是以 / 开头的绝对路径'
        }

        if (action === 'upload') {
          const denial = checkUploadPath(remotePath)
          if (denial) return denial
          if (!args.localPath?.trim()) return 'ERROR: action=upload 时必须提供 localPath'
          const local = resolve(args.localPath)
          const content = await readFile(local).catch((err) => {
            throw new Error(`读取本机文件 ${local} 失败：${err instanceof Error ? err.message : String(err)}`)
          })

          const server = deps.store.require(args.server)
          const backup = await deps.pool.withSftp(
            server,
            async (sftp) => {
              const existing = await sftpStat(sftp, remotePath)
              let backupPath = ''
              if (existing) {
                backupPath = `${remotePath}.bak.${Date.now()}`
                await sftpRename(sftp, remotePath, backupPath)
              }
              await sftpWriteFile(sftp, remotePath, content)
              return backupPath
            },
            exec?.signal,
          )

          return [
            `服务器: ${server.name}`,
            `已上传本机文件 ${local} -> ${remotePath}（${content.length} 字节）`,
            backup ? `原文件已备份到: ${backup}` : '远程原文件不存在，未创建备份',
          ].join('\n')
        }

        const maxBytes = Math.min(1_048_576, Math.max(1, Math.floor(Number(args.maxBytes ?? 65_536) || 65_536)))
        const server = deps.store.require(args.server)
        const data = await deps.pool.withSftp(
          server,
          (sftp) => sftpReadFile(sftp, remotePath),
          exec?.signal,
        )
        const truncated = data.length > maxBytes
        const body = data.subarray(0, maxBytes).toString('utf8')
        return [
          `服务器: ${server.name} | 文件: ${remotePath}`,
          `大小: ${data.length} 字节${truncated ? `（内容已截断到 ${maxBytes} 字节）` : ''}`,
          '--- 内容 ---',
          body,
        ].join('\n')
      })
    },
  })
}
