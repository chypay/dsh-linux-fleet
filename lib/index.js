import {
  checkUploadPath,
  createCommandGuard
} from "./chunk-C4HPNQ6X.js";

// src/config.ts
import Schema from "@deepseek-ai/schemastery";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, resolve } from "path";
import { homedir } from "os";
var Config = Schema.object({
  servers: Schema.array(Schema.object({
    name: Schema.string().required(),
    host: Schema.string().required(),
    port: Schema.number().default(22),
    user: Schema.string().default("root"),
    privateKeyPath: Schema.string().required()
  })).default([]),
  dataFile: Schema.string().default(""),
  connectTimeout: Schema.number().default(15e3),
  commandTimeout: Schema.number().default(3e4),
  commandMaxBytes: Schema.number().default(131072),
  preferConfig: Schema.boolean().default(false),
  extraBlockedPatterns: Schema.array(Schema.string()).default([])
});
function resolveDataFile(config) {
  if (config.dataFile) return resolve(config.dataFile);
  const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(dshHome, "linux-fleet.json");
}
function validateServer(input) {
  const name2 = String(input.name ?? "").trim();
  const host = String(input.host ?? "").trim();
  const user = String(input.user ?? "root").trim();
  const port = Number(input.port ?? 22);
  const privateKeyPath = String(input.privateKeyPath ?? "").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name2)) {
    throw new Error("\u670D\u52A1\u5668\u522B\u540D\u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u548C\u8FDE\u5B57\u7B26\uFF081-64 \u4F4D\uFF09");
  }
  if (!host) throw new Error("host \u4E0D\u80FD\u4E3A\u7A7A");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("port \u5FC5\u987B\u662F 1-65535 \u4E4B\u95F4\u7684\u6574\u6570");
  }
  if (!user) throw new Error("user \u4E0D\u80FD\u4E3A\u7A7A");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(user)) {
    throw new Error("user \u542B\u6709\u975E\u6CD5\u5B57\u7B26");
  }
  if (!privateKeyPath) throw new Error("privateKeyPath \u4E0D\u80FD\u4E3A\u7A7A");
  if (!isAbsolute(privateKeyPath)) {
    throw new Error("privateKeyPath \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4F8B\u5982 C:/Users/me/.ssh/id_ed25519 \u6216 /home/me/.ssh/id_ed25519");
  }
  return { name: name2, host, port, user, privateKeyPath };
}
var ServerStore = class {
  constructor(config, file) {
    this.config = config;
    this.file = file;
  }
  config;
  file;
  servers = [];
  get filePath() {
    return this.file;
  }
  async init() {
    let fromFile = null;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8"));
      if (Array.isArray(parsed?.servers)) {
        fromFile = parsed.servers.map((item) => validateServer(item));
      }
    } catch {
    }
    if (this.config.preferConfig || fromFile === null) {
      this.servers = this.config.servers.map((item) => validateServer(item));
      await this.persist();
    } else {
      this.servers = fromFile;
    }
  }
  list() {
    return this.servers.map((item) => ({ ...item }));
  }
  find(name2) {
    return this.servers.find((item) => item.name === name2);
  }
  /** 工具内部使用：找不到时给出可用别名，避免模型反复猜 */
  require(name2) {
    const server = this.find(String(name2 ?? "").trim());
    if (server) return server;
    const names = this.servers.map((item) => item.name).join(", ") || "\uFF08\u65E0\uFF09";
    throw new Error(`\u627E\u4E0D\u5230\u670D\u52A1\u5668\u522B\u540D "${name2}"\u3002\u5F53\u524D\u53EF\u7528\u522B\u540D\uFF1A${names}`);
  }
  async add(input) {
    const server = validateServer(input);
    if (this.find(server.name)) throw new Error(`\u670D\u52A1\u5668\u522B\u540D "${server.name}" \u5DF2\u5B58\u5728`);
    this.servers.push(server);
    await this.persist();
    return { ...server };
  }
  async update(name2, patch) {
    const index = this.servers.findIndex((item) => item.name === name2);
    if (index < 0) throw new Error(`\u627E\u4E0D\u5230\u670D\u52A1\u5668\u522B\u540D "${name2}"`);
    const merged = validateServer({ ...this.servers[index], ...patch });
    if (merged.name !== name2 && this.find(merged.name)) {
      throw new Error(`\u670D\u52A1\u5668\u522B\u540D "${merged.name}" \u5DF2\u5B58\u5728`);
    }
    this.servers[index] = merged;
    await this.persist();
    return { ...merged };
  }
  async remove(name2) {
    const next = this.servers.filter((item) => item.name !== name2);
    if (next.length === this.servers.length) throw new Error(`\u627E\u4E0D\u5230\u670D\u52A1\u5668\u522B\u540D "${name2}"`);
    this.servers = next;
    await this.persist();
  }
  async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, servers: this.servers }, null, 2), {
      encoding: "utf8",
      mode: 384
    });
    await rename(tmp, this.file);
  }
};

// src/ssh-pool.ts
import { Client } from "ssh2";
import { readFile as readFile2 } from "fs/promises";
var SshPool = class {
  constructor(opts) {
    this.opts = opts;
    const period = Math.min(6e4, Math.max(1e3, Math.floor(opts.idleTimeout / 2)));
    this.sweeper = setInterval(() => this.sweep(), period);
    this.sweeper.unref?.();
  }
  opts;
  entries = /* @__PURE__ */ new Map();
  sweeper;
  keyOf(server) {
    return `${server.user}@${server.host}:${server.port}:${server.privateKeyPath}`;
  }
  throwIfAborted(signal) {
    if (signal?.aborted) throw new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88");
  }
  /** 获取可用连接；同一主机并发请求共享同一个 connect Promise */
  async acquire(server, signal) {
    this.throwIfAborted(signal);
    const key = this.keyOf(server);
    const hit = this.entries.get(key);
    if (hit?.client) {
      hit.lastUsed = Date.now();
      return hit.client;
    }
    if (hit?.connecting) return hit.connecting;
    const entry = hit ?? { key, client: null, connecting: null, lastUsed: Date.now() };
    this.entries.set(key, entry);
    const pending = this.connect(server, key, signal);
    entry.connecting = pending;
    try {
      const client = await pending;
      entry.client = client;
      entry.connecting = null;
      entry.lastUsed = Date.now();
      if (signal?.aborted) {
        this.drop(key);
        throw new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88");
      }
      return client;
    } catch (err) {
      if (entry.connecting === pending) this.entries.delete(key);
      throw err;
    }
  }
  async connect(server, key, signal) {
    const privateKey = await readFile2(server.privateKeyPath).catch((err) => {
      throw new Error(`\u8BFB\u53D6\u79C1\u94A5 ${server.privateKeyPath} \u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
    });
    const client = new Client();
    client.on("error", () => this.drop(key));
    client.on("close", () => this.entries.delete(key));
    const onAbort = () => {
      try {
        client.end();
      } catch {
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await new Promise((resolve3, reject) => {
        let settled = false;
        const timer = setTimeout(
          () => finish(new Error(`\u8FDE\u63A5 ${server.name} (${server.host}:${server.port}) \u8D85\u65F6\uFF08${this.opts.connectTimeout}ms\uFF09`)),
          this.opts.connectTimeout
        );
        const finish = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          err ? reject(err) : resolve3();
        };
        client.once("ready", () => finish());
        client.once("error", (err) => finish(err));
        const config = {
          host: server.host,
          port: server.port,
          username: server.user,
          privateKey,
          readyTimeout: this.opts.connectTimeout,
          keepaliveInterval: 15e3,
          keepaliveCountMax: 3
        };
        try {
          client.connect(config);
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });
      return client;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
  /** 执行命令：返回 stdout / stderr / 退出码，超时与取消会关闭远端通道 */
  async exec(server, command, opts = {}) {
    const started = Date.now();
    this.throwIfAborted(opts.signal);
    const client = await this.acquire(server, opts.signal);
    const timeout = opts.timeout && opts.timeout > 0 ? opts.timeout : this.opts.commandTimeout;
    return new Promise((resolve3, reject) => {
      let settled = false;
      let timer;
      let onAbort;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (opts.signal && onAbort) opts.signal.removeEventListener("abort", onAbort);
      };
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        err ? reject(err) : resolve3(value);
      };
      client.exec(command, (err, stream) => {
        if (err) {
          finish(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        let outTruncated = false;
        let errTruncated = false;
        const cap = this.opts.maxOutputBytes;
        const append = (chunk, kind) => {
          const current = kind === "out" ? stdout : stderr;
          const room = Math.max(0, cap - current.length);
          if (room === 0) {
            kind === "out" ? outTruncated = true : errTruncated = true;
            return;
          }
          const text = chunk.toString("utf8");
          if (kind === "out") stdout += text.slice(0, room);
          else stderr += text.slice(0, room);
          if (text.length > room) {
            kind === "out" ? outTruncated = true : errTruncated = true;
          }
        };
        stream.on("data", (chunk) => append(chunk, "out"));
        stream.stderr.on("data", (chunk) => append(chunk, "err"));
        stream.on("error", (error) => finish(error));
        stream.on("close", (code) => {
          finish(void 0, {
            stdout: stdout + (outTruncated ? "\n[\u8F93\u51FA\u5DF2\u622A\u65AD]" : ""),
            stderr: stderr + (errTruncated ? "\n[\u8F93\u51FA\u5DF2\u622A\u65AD]" : ""),
            exitCode: typeof code === "number" ? code : -1,
            durationMs: Date.now() - started
          });
        });
        timer = setTimeout(() => {
          try {
            stream.close();
          } catch {
          }
          finish(new Error(`\u547D\u4EE4\u6267\u884C\u8D85\u65F6\uFF08${timeout}ms\uFF09`));
        }, timeout);
        onAbort = () => {
          try {
            stream.close();
          } catch {
          }
          finish(new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88"));
        };
        if (opts.signal?.aborted) onAbort();
        else opts.signal?.addEventListener("abort", onAbort, { once: true });
      });
    });
  }
  /** 在一条 SFTP 会话中执行操作，结束后只关闭 SFTP 子通道，保留 SSH 连接 */
  async withSftp(server, fn, signal) {
    this.throwIfAborted(signal);
    const client = await this.acquire(server, signal);
    const sftp = await new Promise((resolve3, reject) => {
      client.sftp((err, wrapper) => {
        err ? reject(err) : resolve3(wrapper);
      });
    });
    try {
      return await fn(sftp);
    } finally {
      try {
        sftp.end();
      } catch {
      }
    }
  }
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (!entry.connecting && entry.client && now - entry.lastUsed > this.opts.idleTimeout) {
        this.drop(key);
      }
    }
  }
  drop(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    try {
      entry.client?.end();
    } catch {
    }
    this.entries.delete(key);
  }
  dispose() {
    clearInterval(this.sweeper);
    for (const key of [...this.entries.keys()]) this.drop(key);
  }
};
function sftpReadFile(sftp, path) {
  return new Promise((resolve3, reject) => {
    sftp.readFile(path, (err, data) => err ? reject(err) : resolve3(data));
  });
}
function sftpWriteFile(sftp, path, data) {
  return new Promise((resolve3, reject) => {
    sftp.writeFile(path, data, (err) => err ? reject(err) : resolve3());
  });
}
function sftpStat(sftp, path) {
  return new Promise((resolve3) => {
    sftp.stat(path, (err, stats) => resolve3(err ? null : stats));
  });
}
function sftpRename(sftp, from, to) {
  return new Promise((resolve3, reject) => {
    sftp.rename(from, to, (err) => err ? reject(err) : resolve3());
  });
}

// src/tools/shared.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
function stringOutput() {
  return {
    schema: { type: "string" },
    render: (_args, value) => [{ type: "text", text: value }]
  };
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
async function guarded(deps, fn) {
  try {
    await deps.ready;
    return await fn();
  } catch (err) {
    return `ERROR: ${errorMessage(err)}`;
  }
}
function tool(definition) {
  return defineTool(definition);
}

// src/tools/server-list.ts
function createServerListTool(deps) {
  return tool({
    name: "linux_server_list",
    description: "\u5217\u51FA\u5F53\u524D\u5DF2\u914D\u7F6E\u7684\u6240\u6709\u8FDC\u7A0B Linux \u670D\u52A1\u5668\uFF1A\u522B\u540D\u3001\u4E3B\u673A\u3001\u7AEF\u53E3\u3001\u7528\u6237\u540D\u4E0E\u79C1\u94A5\u8DEF\u5F84\u3002\u5728\u8C03\u7528\u5176\u5B83 linux_* \u5DE5\u5177\u524D\uFF0C\u5148\u7528\u672C\u5DE5\u5177\u786E\u8BA4\u8981\u4F7F\u7528\u7684\u670D\u52A1\u5668\u522B\u540D\u3002",
    parameters: {},
    output: stringOutput(),
    async execute() {
      return guarded(deps, async () => {
        const servers = deps.store.list();
        if (servers.length === 0) {
          return "\u5F53\u524D\u6CA1\u6709\u914D\u7F6E\u4EFB\u4F55 Linux \u670D\u52A1\u5668\u3002\u8BF7\u5728 DSH Web \u8BBE\u7F6E\u7684\u300CLinux \u670D\u52A1\u5668\u300D\u9875\u6DFB\u52A0\uFF0C\u6216\u5728 cordis.patch.yml \u7684 config.servers \u4E2D\u914D\u7F6E\u3002";
        }
        const lines = servers.map(
          (s) => `- ${s.name}: ${s.user}@${s.host}:${s.port}\uFF08\u79C1\u94A5: ${s.privateKeyPath}\uFF09`
        );
        return `\u5DF2\u914D\u7F6E ${servers.length} \u53F0 Linux \u670D\u52A1\u5668\uFF1A
${lines.join("\n")}`;
      });
    }
  });
}

// src/tools/sys-info.ts
var SYS_INFO_SCRIPT = String.raw`echo "=== 系统 ==="
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
df -h`;
function createSysInfoTool(deps) {
  return tool({
    name: "linux_sys_info",
    description: "\u4E00\u952E\u83B7\u53D6\u6307\u5B9A\u8FDC\u7A0B Linux \u670D\u52A1\u5668\u7684\u7CFB\u7EDF\u4FE1\u606F\uFF1ACPU \u4F7F\u7528\u7387\u3001\u5185\u5B58\u5360\u7528\u3001\u78C1\u76D8\u7A7A\u95F4(df -h)\u3001\u7CFB\u7EDF\u8D1F\u8F7D(uptime)\u548C\u8FD0\u884C\u65F6\u95F4\u3002\u8FD4\u56DE\u539F\u59CB\u6587\u672C\u62A5\u544A\u3002",
    parameters: {
      server: {
        type: "string",
        required: true,
        description: "\u670D\u52A1\u5668\u522B\u540D\uFF0C\u53EF\u7528 linux_server_list \u67E5\u770B"
      },
      timeout: {
        type: "number",
        description: "\u547D\u4EE4\u8D85\u65F6\u6BEB\u79D2\u6570\uFF0C\u53EF\u9009\uFF0C\u9ED8\u8BA4\u4F7F\u7528\u63D2\u4EF6\u914D\u7F6E"
      }
    },
    output: stringOutput(),
    async execute(args, exec) {
      return guarded(deps, async () => {
        const server = deps.store.require(args.server);
        const result = await deps.pool.exec(server, SYS_INFO_SCRIPT, {
          signal: exec?.signal,
          timeout: args.timeout
        });
        const parts = [
          `\u670D\u52A1\u5668: ${server.name} (${server.user}@${server.host}:${server.port})`,
          result.stdout.trim()
        ];
        if (result.stderr.trim()) parts.push(`[stderr]
${result.stderr.trim()}`);
        parts.push(`[\u8017\u65F6 ${result.durationMs}ms\uFF0C\u9000\u51FA\u7801 ${result.exitCode}]`);
        return parts.join("\n");
      });
    }
  });
}

// src/tools/exec-cmd.ts
function createExecCmdTool(deps) {
  return tool({
    name: "linux_exec_cmd",
    description: "\u5728\u6307\u5B9A\u8FDC\u7A0B Linux \u670D\u52A1\u5668\u4E0A\u6267\u884C Shell \u547D\u4EE4\uFF0C\u8FD4\u56DE stdout\u3001stderr \u548C\u9000\u51FA\u7801\u3002\u9AD8\u5371\u547D\u4EE4\uFF08rm -rf /\u3001shutdown\u3001reboot\u3001mkfs\u3001fdisk \u7B49\uFF09\u4F1A\u88AB\u9ED1\u540D\u5355\u62D2\u7EDD\u3002",
    parameters: {
      server: {
        type: "string",
        required: true,
        description: "\u670D\u52A1\u5668\u522B\u540D\uFF0C\u53EF\u7528 linux_server_list \u67E5\u770B"
      },
      command: {
        type: "string",
        required: true,
        description: "\u8981\u6267\u884C\u7684 shell \u547D\u4EE4\u539F\u6587"
      },
      timeout: {
        type: "number",
        description: "\u547D\u4EE4\u8D85\u65F6\u6BEB\u79D2\u6570\uFF0C\u53EF\u9009"
      }
    },
    output: stringOutput(),
    async execute(args, exec) {
      return guarded(deps, async () => {
        const command = String(args.command ?? "");
        if (!command.trim()) return "ERROR: command \u4E0D\u80FD\u4E3A\u7A7A";
        const verdict = deps.guard.check(command);
        if (verdict.blocked) {
          return `\u62D2\u7EDD\u6267\u884C\uFF1A\u8BE5\u547D\u4EE4\u547D\u4E2D\u9AD8\u5371\u9ED1\u540D\u5355\uFF08${verdict.reason}\uFF09\u3002\u8BF7\u6539\u7528\u53D7\u63A7\u5DE5\u5177\u6216\u4EBA\u5DE5\u5728\u670D\u52A1\u5668\u4E0A\u64CD\u4F5C\u3002`;
        }
        const server = deps.store.require(args.server);
        const result = await deps.pool.exec(server, command, {
          signal: exec?.signal,
          timeout: args.timeout
        });
        const parts = [
          `\u670D\u52A1\u5668: ${server.name}`,
          `\u547D\u4EE4: ${command}`,
          `\u9000\u51FA\u7801: ${result.exitCode}`,
          `--- stdout ---
${result.stdout || "(\u7A7A)"}`,
          `--- stderr ---
${result.stderr || "(\u7A7A)"}`,
          `\u8017\u65F6: ${result.durationMs}ms`
        ];
        return parts.join("\n");
      });
    }
  });
}

// src/tools/service-manage.ts
var ACTIONS = ["status", "start", "stop", "restart", "logs"];
var SERVICE_NAME_RE = /^[A-Za-z0-9@._:\-\\]{1,128}$/;
function buildCommand(action, service, lines) {
  switch (action) {
    case "status":
      return `systemctl status ${service} --no-pager -l`;
    case "start":
      return `systemctl start ${service} && systemctl status ${service} --no-pager -l | head -20`;
    case "stop":
      return `systemctl stop ${service} && systemctl is-active ${service} || true`;
    case "restart":
      return `systemctl restart ${service} && systemctl status ${service} --no-pager -l | head -20`;
    case "logs":
      return `journalctl -u ${service} -n ${lines} --no-pager`;
  }
}
function createServiceManageTool(deps) {
  return tool({
    name: "linux_service_manage",
    description: "\u901A\u8FC7 systemctl \u7BA1\u7406\u6307\u5B9A\u8FDC\u7A0B\u670D\u52A1\u5668\u4E0A\u7684\u670D\u52A1\uFF1A\u67E5\u8BE2 status\u3001start\u3001stop\u3001restart\uFF0C\u6216\u7528 logs \u83B7\u53D6\u6700\u8FD1 50 \u884C journalctl \u65E5\u5FD7\u3002",
    parameters: {
      server: {
        type: "string",
        required: true,
        description: "\u670D\u52A1\u5668\u522B\u540D"
      },
      service: {
        type: "string",
        required: true,
        description: "systemd \u670D\u52A1\u540D\uFF0C\u4F8B\u5982 nginx.service\u3001docker"
      },
      action: {
        type: "string",
        required: true,
        description: "\u64CD\u4F5C\uFF1Astatus | start | stop | restart | logs"
      },
      lines: {
        type: "number",
        description: "action=logs \u65F6\u8FD4\u56DE\u7684\u65E5\u5FD7\u884C\u6570\uFF0C\u9ED8\u8BA4 50\uFF0C\u6700\u5927 500"
      }
    },
    output: stringOutput(),
    async execute(args, exec) {
      return guarded(deps, async () => {
        const action = String(args.action ?? "status");
        if (!ACTIONS.includes(action)) {
          return `ERROR: \u4E0D\u652F\u6301\u7684 action "${args.action}"\uFF0C\u53EF\u9009\u503C\uFF1A${ACTIONS.join(" | ")}`;
        }
        const service = String(args.service ?? "").trim();
        if (!SERVICE_NAME_RE.test(service)) {
          return "ERROR: service \u540D\u4E0D\u5408\u6CD5\uFF0C\u53EA\u5141\u8BB8\u5B57\u6BCD\u3001\u6570\u5B57\u3001@ . _ : - \u548C\u53CD\u659C\u6760";
        }
        const lines = Math.min(500, Math.max(1, Math.floor(Number(args.lines ?? 50) || 50)));
        const server = deps.store.require(args.server);
        const command = buildCommand(action, service, lines);
        const result = await deps.pool.exec(server, command, { signal: exec?.signal });
        const parts = [
          `\u670D\u52A1\u5668: ${server.name} | \u670D\u52A1: ${service} | \u64CD\u4F5C: ${action}`,
          `\u9000\u51FA\u7801: ${result.exitCode}`,
          `--- \u8F93\u51FA ---
${result.stdout || "(\u7A7A)"}`
        ];
        if (result.stderr.trim()) parts.push(`--- stderr ---
${result.stderr.trim()}`);
        return parts.join("\n");
      });
    }
  });
}

// src/tools/file-ops.ts
import { readFile as readFile3 } from "fs/promises";
import { resolve as resolve2 } from "path";
function createFileOpsTool(deps) {
  return tool({
    name: "linux_file_ops",
    description: "\u8FDC\u7A0B\u6587\u4EF6\u64CD\u4F5C\uFF1Aaction=read \u8BFB\u53D6\u8FDC\u7A0B\u6587\u4EF6\u5185\u5BB9\uFF1Baction=upload \u5C06\u672C\u673A\u6587\u4EF6\u901A\u8FC7 SFTP \u4E0A\u4F20\u5230\u8FDC\u7A0B\u8DEF\u5F84\uFF0C\u4E0A\u4F20\u524D\u81EA\u52A8\u5907\u4EFD\u539F\u6587\u4EF6\u4E3A .bak.<\u65F6\u95F4\u6233>\u3002",
    parameters: {
      server: {
        type: "string",
        required: true,
        description: "\u670D\u52A1\u5668\u522B\u540D"
      },
      action: {
        type: "string",
        required: true,
        description: "\u64CD\u4F5C\uFF1Aread | upload"
      },
      path: {
        type: "string",
        required: true,
        description: "\u8FDC\u7A0B\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84"
      },
      localPath: {
        type: "string",
        description: "action=upload \u65F6\u5FC5\u586B\uFF1A\u672C\u673A\u8981\u4E0A\u4F20\u7684\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84"
      },
      maxBytes: {
        type: "number",
        description: "action=read \u65F6\u6700\u591A\u8FD4\u56DE\u7684\u5B57\u8282\u6570\uFF0C\u9ED8\u8BA4 65536"
      }
    },
    output: stringOutput(),
    async execute(args, exec) {
      return guarded(deps, async () => {
        const action = String(args.action ?? "").toLowerCase();
        const remotePath = String(args.path ?? "").trim();
        if (action !== "read" && action !== "upload") {
          return "ERROR: action \u53EA\u652F\u6301 read \u6216 upload";
        }
        if (!remotePath || !remotePath.startsWith("/")) {
          return "ERROR: \u8FDC\u7A0B path \u5FC5\u987B\u662F\u4EE5 / \u5F00\u5934\u7684\u7EDD\u5BF9\u8DEF\u5F84";
        }
        if (action === "upload") {
          const denial = checkUploadPath(remotePath);
          if (denial) return denial;
          if (!args.localPath?.trim()) return "ERROR: action=upload \u65F6\u5FC5\u987B\u63D0\u4F9B localPath";
          const local = resolve2(args.localPath);
          const content = await readFile3(local).catch((err) => {
            throw new Error(`\u8BFB\u53D6\u672C\u673A\u6587\u4EF6 ${local} \u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
          });
          const server2 = deps.store.require(args.server);
          const backup = await deps.pool.withSftp(
            server2,
            async (sftp) => {
              const existing = await sftpStat(sftp, remotePath);
              let backupPath = "";
              if (existing) {
                backupPath = `${remotePath}.bak.${Date.now()}`;
                await sftpRename(sftp, remotePath, backupPath);
              }
              await sftpWriteFile(sftp, remotePath, content);
              return backupPath;
            },
            exec?.signal
          );
          return [
            `\u670D\u52A1\u5668: ${server2.name}`,
            `\u5DF2\u4E0A\u4F20\u672C\u673A\u6587\u4EF6 ${local} -> ${remotePath}\uFF08${content.length} \u5B57\u8282\uFF09`,
            backup ? `\u539F\u6587\u4EF6\u5DF2\u5907\u4EFD\u5230: ${backup}` : "\u8FDC\u7A0B\u539F\u6587\u4EF6\u4E0D\u5B58\u5728\uFF0C\u672A\u521B\u5EFA\u5907\u4EFD"
          ].join("\n");
        }
        const maxBytes = Math.min(1048576, Math.max(1, Math.floor(Number(args.maxBytes ?? 65536) || 65536)));
        const server = deps.store.require(args.server);
        const data = await deps.pool.withSftp(
          server,
          (sftp) => sftpReadFile(sftp, remotePath),
          exec?.signal
        );
        const truncated = data.length > maxBytes;
        const body = data.subarray(0, maxBytes).toString("utf8");
        return [
          `\u670D\u52A1\u5668: ${server.name} | \u6587\u4EF6: ${remotePath}`,
          `\u5927\u5C0F: ${data.length} \u5B57\u8282${truncated ? `\uFF08\u5185\u5BB9\u5DF2\u622A\u65AD\u5230 ${maxBytes} \u5B57\u8282\uFF09` : ""}`,
          "--- \u5185\u5BB9 ---",
          body
        ].join("\n");
      });
    }
  });
}

// src/tools/index.ts
function registerAllTools(ctx, deps) {
  const tools = [
    createServerListTool(deps),
    createSysInfoTool(deps),
    createExecCmdTool(deps),
    createServiceManageTool(deps),
    createFileOpsTool(deps)
  ];
  for (const definition of tools) {
    ctx.tools.register(definition);
  }
}

// src/routes.ts
var BASE = "/api/linux-fleet/";
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}
function readBody(req, limit = 1048576) {
  return new Promise((resolve3, reject) => {
    let data = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      data += chunk.toString("utf8");
      if (data.length > limit) {
        tooLarge = true;
        reject(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"));
      }
    });
    req.on("end", () => {
      if (!tooLarge) resolve3(data);
    });
    req.on("error", reject);
  });
}
function registerHostRoutes(ctx, deps) {
  ctx.webServer.register({
    kind: "prefix",
    path: BASE,
    handler: async (req, res) => {
      try {
        if (ctx.connection?.requestRejection?.(req)) {
          send(res, 403, { ok: false, error: "\u8BF7\u6C42\u672A\u901A\u8FC7 DSH \u8FDE\u63A5\u6821\u9A8C" });
          return;
        }
        await deps.ready;
        const url = new URL(req.url || "/", "http://localhost");
        const sub = url.pathname.slice(BASE.length).replace(/^\/+/, "");
        const method = (req.method || "GET").toUpperCase();
        let body = {};
        if (method === "POST" || method === "PUT") {
          const raw = await readBody(req);
          body = raw ? JSON.parse(raw) : {};
          if (typeof body !== "object" || body === null) throw new Error("\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
        }
        if (method === "GET" && sub === "health") {
          send(res, 200, { ok: true, service: "dsh-linux-fleet" });
          return;
        }
        if (method === "GET" && sub === "servers") {
          send(res, 200, { ok: true, servers: deps.store.list(), dataFile: deps.store.filePath });
          return;
        }
        if (method === "POST" && sub === "servers") {
          const server = await deps.store.add(body);
          send(res, 200, { ok: true, server });
          return;
        }
        if (method === "POST" && sub === "servers/update") {
          const server = await deps.store.update(String(body.originalName ?? body.name ?? ""), body);
          send(res, 200, { ok: true, server });
          return;
        }
        if (method === "POST" && sub === "servers/delete") {
          await deps.store.remove(String(body.name ?? ""));
          send(res, 200, { ok: true });
          return;
        }
        if (method === "POST" && sub === "test") {
          const server = deps.store.require(String(body.name ?? ""));
          const started = Date.now();
          const result = await deps.pool.exec(server, "echo DSH_LINUX_FLEET_OK", {
            timeout: deps.config.connectTimeout + 3e3
          });
          const ok = result.exitCode === 0 && result.stdout.includes("DSH_LINUX_FLEET_OK");
          send(res, 200, {
            ok,
            name: server.name,
            latencyMs: Date.now() - started,
            exitCode: result.exitCode,
            error: ok ? void 0 : result.stderr.trim() || "\u672A\u6536\u5230\u671F\u671B\u7684 SSH \u54CD\u5E94"
          });
          return;
        }
        send(res, 404, { ok: false, error: `\u672A\u77E5\u63A5\u53E3: ${method} ${sub}` });
      } catch (err) {
        send(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  });
}

// src/index.ts
var name = "dsh-linux-fleet";
var inject = ["tools", "webServer", "connection"];
function apply(ctx, config) {
  const store = new ServerStore(config, resolveDataFile(config));
  const ready = store.init();
  const pool = new SshPool({
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    idleTimeout: 5 * 6e4,
    maxOutputBytes: config.commandMaxBytes
  });
  const guard = createCommandGuard(config.extraBlockedPatterns);
  registerAllTools(ctx, { config, store, pool, guard, ready, ctx });
  registerHostRoutes(ctx, { config, store, pool, ready });
  void ready.then(() => ctx.logger?.info?.(`[dsh-linux-fleet] \u5DF2\u52A0\u8F7D\uFF0C${store.list().length} \u53F0\u670D\u52A1\u5668\uFF0C\u6E05\u5355\u6587\u4EF6: ${store.filePath}`)).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger?.warn?.(`[dsh-linux-fleet] \u670D\u52A1\u5668\u6E05\u5355\u52A0\u8F7D\u5931\u8D25: ${message}`);
  });
  ctx.effect(() => () => pool.dispose());
}
export {
  Config,
  apply,
  inject,
  name
};
