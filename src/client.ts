// @ts-ignore - DSH 浏览器端提供 React
import * as React from 'react'
// @ts-ignore - 浏览器侧 Context
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-linux-fleet-client'

const h = React.createElement
const API = '/api/linux-fleet/'

const EMPTY_FORM = {
  name: '',
  host: '',
  port: '22',
  user: 'root',
  privateKeyPath: '',
}

const styles: Record<string, any> = {
  wrap: { display: 'grid', gap: 12 },
  card: {
    border: '1px solid var(--dsw-border, #dcdfe6)',
    borderRadius: 10,
    padding: 14,
    background: 'var(--dsw-layer-2, transparent)',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--dsw-border, #dcdfe6)', opacity: 0.75 },
  td: { padding: '6px 8px', borderBottom: '1px solid var(--dsw-border, #eef0f3)', verticalAlign: 'middle' },
  input: {
    border: '1px solid var(--dsw-border, #dcdfe6)',
    borderRadius: 6,
    padding: '6px 8px',
    background: 'var(--dsw-layer-1, #fff)',
    color: 'inherit',
    font: 'inherit',
    minWidth: 0,
  },
  label: { display: 'grid', gap: 4, fontSize: 12, flex: '1 1 160px' },
  button: {
    border: '1px solid var(--dsw-border, #dcdfe6)',
    borderRadius: 6,
    padding: '5px 10px',
    background: 'var(--dsw-layer-1, #fff)',
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
  },
  primary: {
    border: '1px solid var(--dsw-accent, #4c6ef5)',
    borderRadius: 6,
    padding: '5px 12px',
    background: 'var(--dsw-accent, #4c6ef5)',
    color: '#fff',
    cursor: 'pointer',
    font: 'inherit',
  },
  danger: {
    border: '1px solid #e03131',
    borderRadius: 6,
    padding: '5px 10px',
    background: 'transparent',
    color: '#e03131',
    cursor: 'pointer',
    font: 'inherit',
  },
  muted: { opacity: 0.7, fontSize: 12 },
  error: { color: '#e03131', fontSize: 13 },
  ok: { color: '#2f9e44', fontSize: 12 },
}

async function api(path: string, body?: unknown): Promise<any> {
  const init: RequestInit = body === undefined
    ? { method: 'GET' }
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
  const res = await fetch(API + path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `请求失败 (${res.status})`)
  }
  return data
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function FleetSettings() {
  const [servers, setServers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [form, setForm] = React.useState({ ...EMPTY_FORM })
  const [editing, setEditing] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState<string | null>(null)
  const [testResults, setTestResults] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('servers')
      setServers(data.servers || [])
      setError('')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const change = (key: string) => (event: any) => {
    setForm({ ...form, [key]: event.target.value })
  }

  const save = async () => {
    setNotice('')
    try {
      const payload = {
        ...form,
        port: Number(form.port) || 22,
        originalName: editing ?? undefined,
      }
      if (editing) await api('servers/update', payload)
      else await api('servers', payload)
      setForm({ ...EMPTY_FORM })
      setEditing(null)
      setNotice('已保存')
      await load()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const edit = (server: any) => {
    setEditing(server.name)
    setForm({
      name: server.name,
      host: server.host,
      port: String(server.port),
      user: server.user,
      privateKeyPath: server.privateKeyPath,
    })
    setNotice('')
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }

  const remove = async (name: string) => {
    if (!window.confirm(`确定删除服务器 "${name}" 吗？`)) return
    try {
      await api('servers/delete', { name })
      if (editing === name) cancelEdit()
      setNotice(`已删除 ${name}`)
      await load()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const test = async (name: string) => {
    setTesting(name)
    setTestResults({ ...testResults, [name]: '正在测试…' })
    try {
      const data = await api('test', { name })
      setTestResults({
        ...testResults,
        [name]: data.ok
          ? `连接成功（${data.latencyMs}ms）`
          : `连接失败：${data.error || `退出码 ${data.exitCode}`}`,
      })
    } catch (err) {
      setTestResults({ ...testResults, [name]: `连接失败：${messageOf(err)}` })
    } finally {
      setTesting(null)
    }
  }

  const fields = [
    { key: 'name', label: '别名', placeholder: '例如 prod-web-01' },
    { key: 'host', label: '主机', placeholder: '例如 10.0.0.8' },
    { key: 'port', label: '端口', placeholder: '22' },
    { key: 'user', label: '用户名', placeholder: 'root' },
    { key: 'privateKeyPath', label: '私钥绝对路径', placeholder: '例如 C:/Users/me/.ssh/id_ed25519' },
  ]

  return h('div', { style: styles.wrap },
    h('div', { style: styles.card },
      h('div', { style: { fontWeight: 600, marginBottom: 8 } },
        editing ? `编辑服务器：${editing}` : '新增 Linux 服务器',
      ),
      h('div', { style: styles.row },
        ...fields.map((field) => h('label', { key: field.key, style: styles.label },
          field.label,
          h('input', {
            style: styles.input,
            value: form[field.key as keyof typeof form],
            placeholder: field.placeholder,
            onChange: change(field.key),
          }),
        )),
      ),
      h('div', { style: { ...styles.row, marginTop: 10 } },
        h('button', { style: styles.primary, onClick: () => void save() }, editing ? '保存修改' : '添加服务器'),
        editing && h('button', { style: styles.button, onClick: cancelEdit }, '取消'),
      ),
      error && h('div', { style: styles.error }, error),
      notice && h('div', { style: styles.ok }, notice),
    ),
    h('div', { style: styles.card },
      h('div', { style: { ...styles.row, justifyContent: 'space-between', marginBottom: 8 } },
        h('span', { style: { fontWeight: 600 } }, `已配置服务器（${servers.length}）`),
        h('button', { style: styles.button, onClick: () => void load() }, '刷新列表'),
      ),
      loading
        ? h('div', { style: styles.muted }, '加载中…')
        : servers.length === 0
          ? h('div', { style: styles.muted }, '暂无服务器，请先在上方添加。')
          : h('table', { style: styles.table },
              h('thead', {},
                h('tr', {},
                  ['别名', '主机', '端口', '用户', '私钥', '操作'].map((label) =>
                    h('th', { key: label, style: styles.th }, label),
                  ),
                ),
              ),
              h('tbody', {},
                ...servers.map((server) => h('tr', { key: server.name },
                  h('td', { style: styles.td }, server.name),
                  h('td', { style: styles.td }, server.host),
                  h('td', { style: styles.td }, String(server.port)),
                  h('td', { style: styles.td }, server.user),
                  h('td', { style: { ...styles.td, maxWidth: 200, overflowWrap: 'anywhere' } }, server.privateKeyPath),
                  h('td', { style: styles.td },
                    h('div', { style: styles.row },
                      h('button', {
                        style: styles.button,
                        disabled: testing === server.name,
                        onClick: () => void test(server.name),
                      }, testing === server.name ? '测试中…' : '测试连接'),
                      h('button', { style: styles.button, onClick: () => edit(server) }, '编辑'),
                      h('button', { style: styles.danger, onClick: () => void remove(server.name) }, '删除'),
                      testResults[server.name] && h('span', {
                        style: testResults[server.name].startsWith('连接成功') ? styles.ok : styles.error,
                      }, testResults[server.name]),
                    ),
                  ),
                )),
              ),
            ),
    ),
    h('div', { style: styles.muted },
      '私钥文件需为无口令的 OpenSSH 私钥，且路径为运行 DSH 进程的本机绝对路径。建议权限 0600。',
    ),
  )
}

export function apply(ctx: Context): void {
  // 客户端 slots 服务由 dsh-client-ui-slots 提供，类型声明未必随 cordis 一起安装
  const clientCtx = ctx as any
  if (!clientCtx.slots?.inject || !clientCtx.slots?.register) return
  clientCtx.slots.inject('settings.section', () => clientCtx.slots.register({
    name: 'settings.section',
    id: 'dsh-linux-fleet',
    order: 100,
    label: () => 'Linux 服务器',
  }, FleetSettings))
}
