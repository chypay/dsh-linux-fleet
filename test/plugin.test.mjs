import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, Config } from '../lib/index.js'

test('apply 注册五个工具、一个路由，且工具异常安全', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-linux-fleet-'))
  process.env.DSH_HOME = home

  try {
    const tools = []
    const routes = []
    let dispose = null
    const ctx = {
      effect(fn) { dispose = fn() },
      logger: { info() {}, warn() {} },
      tools: { register(definition) { tools.push(definition) } },
      webServer: { register(route) { routes.push(route) } },
      connection: { requestRejection() { return false } },
    }

    const config = Config({
      servers: [{
        name: 'demo',
        host: '127.0.0.1',
        port: 22,
        user: 'root',
        privateKeyPath: '/tmp/id_ed25519',
      }],
    })

    apply(ctx, config)

    assert.deepEqual(
      tools.map((item) => item.name).sort(),
      [
        'linux_exec_cmd',
        'linux_file_ops',
        'linux_server_list',
        'linux_service_manage',
        'linux_sys_info',
      ],
    )
    assert.equal(routes.length, 1)
    assert.equal(routes[0].kind, 'prefix')
    assert.equal(routes[0].path, '/api/linux-fleet/')

    const find = (name) => tools.find((item) => item.name === name)
    const list = find('linux_server_list')
    const serverListText = await list.execute({})
    assert.match(serverListText, /demo/)

    const exec = find('linux_exec_cmd')
    const blocked = await exec.execute({ server: 'demo', command: 'rm -rf /' })
    assert.match(blocked, /拒绝执行/)
    const missing = await exec.execute({ server: 'nope', command: 'echo hi' })
    assert.match(missing, /ERROR:.*找不到服务器别名/)

    const service = find('linux_service_manage')
    const invalid = await service.execute({ server: 'demo', service: 'nginx;bad', action: 'status' })
    assert.match(invalid, /ERROR: service 名不合法/)

    const files = find('linux_file_ops')
    const protectedFile = await files.execute({ server: 'demo', action: 'upload', path: '/etc/shadow', localPath: '/tmp/a' })
    assert.match(protectedFile, /拒绝上传/)

    assert.equal(typeof dispose, 'function')
    dispose()
  } finally {
    delete process.env.DSH_HOME
    await rm(home, { recursive: true, force: true })
  }
})
