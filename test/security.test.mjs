import test from 'node:test'
import assert from 'node:assert/strict'
import { createCommandGuard, checkUploadPath } from '../lib/security.js'

const guard = createCommandGuard([])

test('拦截 rm -rf / 及其变体', () => {
  assert.equal(guard.check('rm -rf /').blocked, true)
  assert.equal(guard.check('sudo rm -fr /').blocked, true)
  assert.equal(guard.check('echo ok; rm -rf /*').blocked, true)
})

test('不拦截普通路径的删除', () => {
  assert.equal(guard.check('rm -rf /tmp/build').blocked, false)
  assert.equal(guard.check('rm -f ./a.txt').blocked, false)
})

test('拦截关机、重启、格式化、分区与 dd', () => {
  for (const cmd of ['shutdown -h now', 'reboot', 'mkfs.ext4 /dev/sda1', 'fdisk /dev/sda', 'dd if=/dev/zero of=/dev/sda']) {
    assert.equal(guard.check(cmd).blocked, true, cmd)
  }
})

test('拦截分号、管道和 sh -c 包装里的高危命令', () => {
  assert.equal(guard.check('echo hello && reboot').blocked, true)
  assert.equal(guard.check('sh -c "halt"').blocked, true)
})

test('自定义规则与非法正则', () => {
  const custom = createCommandGuard(['\\bkubectl delete ns\\b', '[invalid'])
  assert.equal(custom.check('kubectl delete ns prod').blocked, true)
  assert.equal(custom.check('echo ok').blocked, false)
})

test('上传路径保护', () => {
  assert.ok(checkUploadPath('/etc/shadow'))
  assert.ok(checkUploadPath('/home/me/.ssh/authorized_keys'))
  assert.equal(checkUploadPath('/srv/app/config.yml'), null)
})
