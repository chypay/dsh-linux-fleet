// @ts-ignore - 构建时由 devDependencies 提供
import { defineConfig } from 'tsup'

// Host 半部保持 ESM / Node；Client 半部是浏览器 CJS，由 DSH 的模块加载器加载。
const external = [/^@deepseek-ai\//, /^react(\/|$)/, 'ssh2']

export default defineConfig([
  {
    entry: { index: 'src/index.ts', security: 'src/security.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    outDir: 'lib',
    clean: true,
    dts: true,
    external,
  },
  {
    entry: { client: 'src/client.ts' },
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    clean: false,
    dts: false,
    external,
    outExtension: () => ({ js: '.cjs' }),
  },
])
