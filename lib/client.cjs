"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var React = __toESM(require("react"), 1);
var name = "dsh-linux-fleet-client";
var h = React.createElement;
var API = "/api/linux-fleet/";
var EMPTY_FORM = {
  name: "",
  host: "",
  port: "22",
  user: "root",
  privateKeyPath: ""
};
var styles = {
  wrap: { display: "grid", gap: 12 },
  card: {
    border: "1px solid var(--dsw-border, #dcdfe6)",
    borderRadius: 10,
    padding: 14,
    background: "var(--dsw-layer-2, transparent)"
  },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--dsw-border, #dcdfe6)", opacity: 0.75 },
  td: { padding: "6px 8px", borderBottom: "1px solid var(--dsw-border, #eef0f3)", verticalAlign: "middle" },
  input: {
    border: "1px solid var(--dsw-border, #dcdfe6)",
    borderRadius: 6,
    padding: "6px 8px",
    background: "var(--dsw-layer-1, #fff)",
    color: "inherit",
    font: "inherit",
    minWidth: 0
  },
  label: { display: "grid", gap: 4, fontSize: 12, flex: "1 1 160px" },
  button: {
    border: "1px solid var(--dsw-border, #dcdfe6)",
    borderRadius: 6,
    padding: "5px 10px",
    background: "var(--dsw-layer-1, #fff)",
    color: "inherit",
    cursor: "pointer",
    font: "inherit"
  },
  primary: {
    border: "1px solid var(--dsw-accent, #4c6ef5)",
    borderRadius: 6,
    padding: "5px 12px",
    background: "var(--dsw-accent, #4c6ef5)",
    color: "#fff",
    cursor: "pointer",
    font: "inherit"
  },
  danger: {
    border: "1px solid #e03131",
    borderRadius: 6,
    padding: "5px 10px",
    background: "transparent",
    color: "#e03131",
    cursor: "pointer",
    font: "inherit"
  },
  muted: { opacity: 0.7, fontSize: 12 },
  error: { color: "#e03131", fontSize: 13 },
  ok: { color: "#2f9e44", fontSize: 12 }
};
async function api(path, body) {
  const init = body === void 0 ? { method: "GET" } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  const res = await fetch(API + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `\u8BF7\u6C42\u5931\u8D25 (${res.status})`);
  }
  return data;
}
function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
function FleetSettings() {
  const [servers, setServers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  const [editing, setEditing] = React.useState(null);
  const [testing, setTesting] = React.useState(null);
  const [testResults, setTestResults] = React.useState({});
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("servers");
      setServers(data.servers || []);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  const change = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value });
  };
  const save = async () => {
    setNotice("");
    try {
      const payload = {
        ...form,
        port: Number(form.port) || 22,
        originalName: editing ?? void 0
      };
      if (editing) await api("servers/update", payload);
      else await api("servers", payload);
      setForm({ ...EMPTY_FORM });
      setEditing(null);
      setNotice("\u5DF2\u4FDD\u5B58");
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };
  const edit = (server) => {
    setEditing(server.name);
    setForm({
      name: server.name,
      host: server.host,
      port: String(server.port),
      user: server.user,
      privateKeyPath: server.privateKeyPath
    });
    setNotice("");
  };
  const cancelEdit = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  };
  const remove = async (name2) => {
    if (!window.confirm(`\u786E\u5B9A\u5220\u9664\u670D\u52A1\u5668 "${name2}" \u5417\uFF1F`)) return;
    try {
      await api("servers/delete", { name: name2 });
      if (editing === name2) cancelEdit();
      setNotice(`\u5DF2\u5220\u9664 ${name2}`);
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };
  const test = async (name2) => {
    setTesting(name2);
    setTestResults({ ...testResults, [name2]: "\u6B63\u5728\u6D4B\u8BD5\u2026" });
    try {
      const data = await api("test", { name: name2 });
      setTestResults({
        ...testResults,
        [name2]: data.ok ? `\u8FDE\u63A5\u6210\u529F\uFF08${data.latencyMs}ms\uFF09` : `\u8FDE\u63A5\u5931\u8D25\uFF1A${data.error || `\u9000\u51FA\u7801 ${data.exitCode}`}`
      });
    } catch (err) {
      setTestResults({ ...testResults, [name2]: `\u8FDE\u63A5\u5931\u8D25\uFF1A${messageOf(err)}` });
    } finally {
      setTesting(null);
    }
  };
  const fields = [
    { key: "name", label: "\u522B\u540D", placeholder: "\u4F8B\u5982 prod-web-01" },
    { key: "host", label: "\u4E3B\u673A", placeholder: "\u4F8B\u5982 10.0.0.8" },
    { key: "port", label: "\u7AEF\u53E3", placeholder: "22" },
    { key: "user", label: "\u7528\u6237\u540D", placeholder: "root" },
    { key: "privateKeyPath", label: "\u79C1\u94A5\u7EDD\u5BF9\u8DEF\u5F84", placeholder: "\u4F8B\u5982 C:/Users/me/.ssh/id_ed25519" }
  ];
  return h(
    "div",
    { style: styles.wrap },
    h(
      "div",
      { style: styles.card },
      h(
        "div",
        { style: { fontWeight: 600, marginBottom: 8 } },
        editing ? `\u7F16\u8F91\u670D\u52A1\u5668\uFF1A${editing}` : "\u65B0\u589E Linux \u670D\u52A1\u5668"
      ),
      h(
        "div",
        { style: styles.row },
        ...fields.map((field) => h(
          "label",
          { key: field.key, style: styles.label },
          field.label,
          h("input", {
            style: styles.input,
            value: form[field.key],
            placeholder: field.placeholder,
            onChange: change(field.key)
          })
        ))
      ),
      h(
        "div",
        { style: { ...styles.row, marginTop: 10 } },
        h("button", { style: styles.primary, onClick: () => void save() }, editing ? "\u4FDD\u5B58\u4FEE\u6539" : "\u6DFB\u52A0\u670D\u52A1\u5668"),
        editing && h("button", { style: styles.button, onClick: cancelEdit }, "\u53D6\u6D88")
      ),
      error && h("div", { style: styles.error }, error),
      notice && h("div", { style: styles.ok }, notice)
    ),
    h(
      "div",
      { style: styles.card },
      h(
        "div",
        { style: { ...styles.row, justifyContent: "space-between", marginBottom: 8 } },
        h("span", { style: { fontWeight: 600 } }, `\u5DF2\u914D\u7F6E\u670D\u52A1\u5668\uFF08${servers.length}\uFF09`),
        h("button", { style: styles.button, onClick: () => void load() }, "\u5237\u65B0\u5217\u8868")
      ),
      loading ? h("div", { style: styles.muted }, "\u52A0\u8F7D\u4E2D\u2026") : servers.length === 0 ? h("div", { style: styles.muted }, "\u6682\u65E0\u670D\u52A1\u5668\uFF0C\u8BF7\u5148\u5728\u4E0A\u65B9\u6DFB\u52A0\u3002") : h(
        "table",
        { style: styles.table },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            ["\u522B\u540D", "\u4E3B\u673A", "\u7AEF\u53E3", "\u7528\u6237", "\u79C1\u94A5", "\u64CD\u4F5C"].map(
              (label) => h("th", { key: label, style: styles.th }, label)
            )
          )
        ),
        h(
          "tbody",
          {},
          ...servers.map((server) => h(
            "tr",
            { key: server.name },
            h("td", { style: styles.td }, server.name),
            h("td", { style: styles.td }, server.host),
            h("td", { style: styles.td }, String(server.port)),
            h("td", { style: styles.td }, server.user),
            h("td", { style: { ...styles.td, maxWidth: 200, overflowWrap: "anywhere" } }, server.privateKeyPath),
            h(
              "td",
              { style: styles.td },
              h(
                "div",
                { style: styles.row },
                h("button", {
                  style: styles.button,
                  disabled: testing === server.name,
                  onClick: () => void test(server.name)
                }, testing === server.name ? "\u6D4B\u8BD5\u4E2D\u2026" : "\u6D4B\u8BD5\u8FDE\u63A5"),
                h("button", { style: styles.button, onClick: () => edit(server) }, "\u7F16\u8F91"),
                h("button", { style: styles.danger, onClick: () => void remove(server.name) }, "\u5220\u9664"),
                testResults[server.name] && h("span", {
                  style: testResults[server.name].startsWith("\u8FDE\u63A5\u6210\u529F") ? styles.ok : styles.error
                }, testResults[server.name])
              )
            )
          ))
        )
      )
    ),
    h(
      "div",
      { style: styles.muted },
      "\u79C1\u94A5\u6587\u4EF6\u9700\u4E3A\u65E0\u53E3\u4EE4\u7684 OpenSSH \u79C1\u94A5\uFF0C\u4E14\u8DEF\u5F84\u4E3A\u8FD0\u884C DSH \u8FDB\u7A0B\u7684\u672C\u673A\u7EDD\u5BF9\u8DEF\u5F84\u3002\u5EFA\u8BAE\u6743\u9650 0600\u3002"
    )
  );
}
function apply(ctx) {
  const clientCtx = ctx;
  if (!clientCtx.slots?.inject || !clientCtx.slots?.register) return;
  clientCtx.slots.inject("settings.section", () => clientCtx.slots.register({
    name: "settings.section",
    id: "dsh-linux-fleet",
    order: 100,
    label: () => "Linux \u670D\u52A1\u5668"
  }, FleetSettings));
}
