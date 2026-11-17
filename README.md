# dsh-linux-fleet

一个基于 **Cordis** 架构、使用 **TypeScript** 编写的 **DeepSeek Harness (DSH)** 插件。它通过 `ctx.tools.register` 注册 5 个工具，让 Agent 能管理多台远程 Linux 服务器；同时提供双端插件的 client 半部，在 Web 设置页做服务器增删改查与 SSH 连通性测试。

> DSH 处于开发者预览阶段，@deepseek-ai/* 的 API 可能漂移。本文按当前 Cordis 插件契约编写；如遇版本差异，优先对照你本地 Harness 的 `docs/cookbook/adding-a-tool.md` 与 `ctx.webServer` / `ctx.slots` 声明微调。

## 目录结构

```
dsh-linux-fleet/
├── src/
│   ├── index.ts              # Host 入口：name / inject / Config / apply
│   ├── config.ts             # Cordis Schema 配置 + 服务器清单持久化
│   ├── security.ts           # 高危命令黑名单 + 上传路径保护
│   ├── ssh-pool.ts           # ssh2 连接池、超时、取消、SFTP 封装
│   ├── routes.ts             # Host HTTP 路由（CRUD / 连通性测试）
│   ├── client.ts             # 浏览器半部：settings.section 设置页
│   └── tools/
│       ├── server-list.ts    # linux_server_list
│       ├── sys-info.ts       # linux_sys_info
│       ├── exec-cmd.ts       # linux_exec_cmd
│       ├── service-manage.ts # linux_service_manage
│       ├── file-ops.ts       # linux_file_ops
│       ├── shared.ts         # 统一异常边界与输出契约
│       └── index.ts          # 批量注册
├── cordis.patch.yml          # 推荐的 --patch 挂载配置（host + client）
├── cordis.source.patch.yml   # 零安装 host-only 冒烟测试
├── tsup.config.ts            # 双构建：Host ESM / Client CJS
└── test/security.test.mjs    # 黑名单单元测试
```

## 一、准备与构建

需要 Node.js ≥ 22、pnpm，以及一个已经能启动的 `dsh web`。

```bash
cd C:/Users/Funny/WorkBuddy/2026-11-17-09-19-04/dsh-linux-fleet
npm install          # 或 pnpm install
npm run build        # 产出 lib/index.js 与 lib/client.cjs
npm test             # 构建 + 黑名单单元测试
```

`@deepseek-ai/*` 在 `devDependencies` 里只用于类型与构建，运行时由 Harness 提供；`ssh2` 是唯一真正的运行时依赖。

## 二、在当前 Profile 中启用（patch 方式）

DSH 的加载顺序是：bundle 层 → profile 的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → 命令行 `--patch`。后层可用 `insert` 追加插件行，或用同 `id` 覆盖 `config`。

### 方式 A：完整启用（Host + Web 设置页，推荐）

1. 把插件装进当前 profile 的依赖（路径换成你本机的实际路径）：

```bash
cd "$DSH_HOME/profiles/web"          # 例如 C:/Users/Funny/.dsh/profiles/web
pnpm add file:C:/Users/Funny/WorkBuddy/2026-11-17-09-19-04/dsh-linux-fleet
```

2. 复制本项目的 `cordis.patch.yml` 到 profile 目录，或直接用命令行覆盖层启动：

```bash
dsh web --patch C:/Users/Funny/WorkBuddy/2026-11-17-09-19-04/dsh-linux-fleet/cordis.patch.yml
```

3. 验证加载：终端出现 `[dsh-linux-fleet] 已加载，N 台服务器…`；也可执行 `dsh web --dump-config` 确认配置树里已有 `dsh-linux-fleet` 这一行。

### 方式 B：零安装冒烟测试（只测 Host 工具）

```bash
dsh web --patch C:/Users/Funny/WorkBuddy/2026-11-17-09-19-04/dsh-linux-fleet/cordis.source.patch.yml
```

该方式直接指向 `src/index.ts`，改动源码即可看到效果，但**不会**加载 `./client`，所以设置页不会出现。测完整功能请用方式 A。

### 修改即生效

- 改 `cordis.patch.yml`：profile 的补丁监听会热重载；
- 改插件源码：`npm run dev`（tsup watch）重新构建；用 `file:` 安装时依赖引用会自动跟随。
- 首次安装包后需要**重启** `dsh web`，仅刷新浏览器不够。

## 三、配置说明

配置由 Schemastery 校验并填充默认值，可用 patch 的 `config` 段或 Web 设置页修改。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `servers` | array | `[]` | 服务器列表，每项含 `name` / `host` / `port` / `user` / `privateKeyPath` |
| `dataFile` | string | `$DSH_HOME/linux-fleet.json` | 运行时清单文件；Web UI 的增删改查落到这里 |
| `connectTimeout` | number | `15000` | SSH 连接超时（ms） |
| `commandTimeout` | number | `30000` | 命令执行超时（ms） |
| `commandMaxBytes` | number | `131072` | stdout / stderr 各自的最大保留字节数 |
| `preferConfig` | boolean | `false` | `true` 时每次启动都用 `servers` 覆盖运行时清单 |
| `extraBlockedPatterns` | string[] | `[]` | 追加的高危命令正则（非法正则会被忽略） |

服务器清单的优先级：首次启动时用 `config.servers` 作为种子写入 `dataFile`；之后以 `dataFile` 为准，这样 Web UI 的修改不会被配置覆盖。若希望 patch 配置始终权威，设 `preferConfig: true`。

私钥要求：**无口令的 OpenSSH 私钥**，`privateKeyPath` 必须是运行 DSH 进程的本机绝对路径，建议权限 `0600`。

## 四、注册的工具

| 工具 | 作用 |
| --- | --- |
| `linux_server_list` | 列出所有已配置服务器的别名、主机、端口、用户名与私钥路径 |
| `linux_sys_info` | 一键获取 CPU 使用率、内存、磁盘（`df -h`）、负载（`uptime`）与运行时间 |
| `linux_exec_cmd` | 执行 Shell 命令，返回 stdout / stderr / 退出码；命中黑名单直接拒绝 |
| `linux_service_manage` | `status` / `start` / `stop` / `restart`，或 `logs` 取最近 N 行 journalctl（默认 50） |
| `linux_file_ops` | `read` 读远程文件；`upload` 通过 SFTP 上传并在覆盖前自动备份 |

可直接对 Agent 说：

```
先列出我能用的 Linux 服务器，然后查看 prod-web-01 的 CPU、内存和磁盘情况。
在 prod-web-01 上执行 uptime，告诉我退出码。
把 nginx 在 prod-web-01 上重启，再给我最近 50 行日志。
读取 prod-web-01 的 /etc/hosts。
把本机的 C:/tmp/app.yml 上传到 prod-web-01 的 /srv/app/config.yml（记得备份原文件）。
```

所有工具都在内部捕获异常并返回 `ERROR: …` 文本，不会因为一次失败让插件或 Agent 崩溃；`exec.signal` 会透传到底层，支持取消。

### 安全限制

- 内置黑名单拦截：`rm -rf /`、`shutdown` / `reboot` / `halt` / `poweroff`、`mkfs`、`fdisk` / `parted`、`dd` 裸设备写、直接重定向到 `/dev/sd*`、`chmod -R 777 /`、`kill -9 -1`、fork 炸弹、管道执行远程脚本、清空防火墙等。
- 命令会按 `;`、`&&`、`||`、`|`、换行拆分逐段检查，并剥离 `sudo` 与 `sh -c "..."` 包装，防止简单绕过。
- `linux_service_manage` 的服务名走白名单，`linux_file_ops` 的上传路径禁止覆盖 `/etc/shadow`、`/etc/sudoers`、`authorized_keys` 等关键文件。
- 这是**应用层**防线，不替代 DSH 自己的沙箱与审批机制；生产环境仍应配合最小权限账户与受限 sudo。

## 五、Web UI 客户端扩展

client 半部通过 `ctx.slots.inject('settings.section', …)` 在 **设置 → Linux 服务器** 注册一个分区，支持：

- 表格查看所有服务器（别名 / 主机 / 端口 / 用户 / 私钥路径）；
- 新增、编辑、删除服务器（表单即时校验）；
- 每台服务器一键「测试连接」，显示耗时或失败原因；
- 刷新列表、错误提示与状态反馈。

对应的 Host 路由挂在 `ctx.webServer` 的 `/api/linux-fleet/` 前缀上：

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/linux-fleet/servers` | 列出服务器与清单文件路径 |
| `POST /api/linux-fleet/servers` | 新增 |
| `POST /api/linux-fleet/servers/update` | 按 `originalName` 更新 |
| `POST /api/linux-fleet/servers/delete` | 删除 |
| `POST /api/linux-fleet/test` | SSH 连通性测试（`echo` 探针） |
| `GET /api/linux-fleet/health` | 健康检查 |

路由统一经过 `ctx.connection.requestRejection(req)` 的 DSH 连接信任校验。

## 六、验证清单

1. `npm test` 通过黑名单单元测试；
2. 终端出现 `[dsh-linux-fleet] 已加载…`；
3. 对话中执行 `linux_server_list`，能看到配置里的别名；
4. 让 Agent 调用 `linux_sys_info` 检查一台真实主机；
5. 执行 `rm -rf /` 之类的命令，应返回「拒绝执行：…黑名单…」；
6. 打开设置页 → Linux 服务器，新增一台并点「测试连接」显示成功；
7. 用 `linux_file_ops` 上传一个文件，确认远程出现 `.bak.<时间戳>` 备份。

## 七、常见问题

- **只加载了 Host、设置页没出现**：多半是直接引用了 `src/index.ts`（方式 B）或没把包装进 profile 依赖。请改用方式 A，确认 `package.json` 的 `exports["./client"]` 指向 `lib/client.cjs`。
- **`ctx.tools` 为 undefined**：宿主版本没有 `tools` 服务，或漏了 `inject = ['tools']`。本插件已声明，但需确认 Harness 版本支持。
- **路由 403**：`ctx.connection` 的信任校验拒绝了请求，检查是否从 DSH 页面同源发起。
- **SSH 连接超时**：确认私钥无口令、路径是 DSH 进程所在机器的绝对路径、目标主机开放 22 端口；必要时调大 `connectTimeout`。
- **输出 schema / 渲染差异**：本插件统一用 `{ type: 'string' }` 的 canonical value + `render` 文本块，这是各版本最稳定的形态；如需结构化输出，可按目标版本的 `ValueSchemaSpec` 把 `stringOutput()` 换成对象 schema。
