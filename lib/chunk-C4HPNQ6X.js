// src/security.ts
var BUILTIN_RULES = [
  {
    pattern: String.raw`\brm\s+-(?=[a-zA-Z]*[rR])(?=[a-zA-Z]*[fF])[a-zA-Z]+\s+(\/\*|\/|\*|~|--no-preserve-root)(\s|$)`,
    reason: "\u9012\u5F52\u5F3A\u5236\u5220\u9664\u6839\u76EE\u5F55\u3001\u5BB6\u76EE\u5F55\u6216\u901A\u914D\u7B26\uFF08\u5982 rm -rf /\uFF09"
  },
  {
    pattern: String.raw`\b(shutdown|reboot|halt|poweroff|init\s+[06])\b`,
    reason: "\u5173\u673A\u6216\u91CD\u542F\u4E3B\u673A"
  },
  {
    pattern: String.raw`\bmkfs(\.[a-z0-9]+)?\b`,
    reason: "\u683C\u5F0F\u5316\u6587\u4EF6\u7CFB\u7EDF\uFF08mkfs\uFF09"
  },
  {
    pattern: String.raw`\b(fdisk|parted|gdisk|sfdisk)\b`,
    reason: "\u4FEE\u6539\u78C1\u76D8\u5206\u533A\u8868"
  },
  {
    pattern: String.raw`\bdd\s+if=|\bdd\s+[^;|]{0,300}\bof=/dev/`,
    reason: "dd \u88F8\u8BBE\u5907\u8BFB\u5199"
  },
  {
    pattern: String.raw`>\s*/dev/(sd|nvme|vd|hd|xvd|loop)[a-z0-9]*\b`,
    reason: "\u76F4\u63A5\u5199\u5757\u8BBE\u5907"
  },
  {
    pattern: String.raw`\bchmod\s+-(?=[a-zA-Z]*[rR])[a-zA-Z]*\s+777\s+(\/\*|\/|\*|~)(\s|$)`,
    reason: "\u9012\u5F52\u653E\u5F00\u6839\u76EE\u5F55\u6743\u9650"
  },
  {
    pattern: String.raw`\bkill\s+-[a-zA-Z0-9]*\s+-1\b`,
    reason: "\u5411\u5168\u90E8\u8FDB\u7A0B\u53D1\u9001\u4FE1\u53F7"
  },
  {
    pattern: String.raw`:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;`,
    reason: "fork \u70B8\u5F39"
  },
  {
    pattern: String.raw`(curl|wget)\b[^|]{0,500}\|\s*(sudo\s+)?(ba|z|da|k)?sh\b`,
    reason: "\u4E0B\u8F7D\u5E76\u76F4\u63A5\u6267\u884C\u8FDC\u7A0B\u811A\u672C"
  },
  {
    pattern: String.raw`\b(iptables\s+-F|nft\s+flush|ufw\s+disable)\b`,
    reason: "\u6E05\u7A7A\u6216\u5173\u95ED\u9632\u706B\u5899\u89C4\u5219"
  }
];
function splitSegments(command) {
  return command.split(/(?:&&|\|\||[;|\n])/).map((segment) => {
    let text = segment.split("#")[0].trim();
    text = text.replace(/^(?:sudo\s+|env\s+)+/i, "");
    const wrapped = text.match(/^(?:bash|sh|zsh|dash)\s+-c\s+['"]([\s\S]+)['"]$/i);
    if (wrapped) text = wrapped[1];
    return text.trim();
  }).filter(Boolean);
}
function createCommandGuard(extraPatterns = []) {
  const rules = [
    ...BUILTIN_RULES,
    ...extraPatterns.map((pattern) => ({ pattern, reason: "\u547D\u4E2D\u81EA\u5B9A\u4E49\u9AD8\u5371\u547D\u4EE4\u89C4\u5219" }))
  ].map((rule) => ({ ...rule }));
  const compiled = [];
  for (const rule of rules) {
    try {
      compiled.push({ re: new RegExp(rule.pattern, "i"), reason: rule.reason, pattern: rule.pattern });
    } catch {
    }
  }
  return {
    check(command) {
      if (!command || !command.trim()) return { blocked: false };
      for (const segment of splitSegments(command)) {
        for (const rule of compiled) {
          if (rule.re.test(segment)) {
            return { blocked: true, reason: rule.reason, pattern: rule.pattern };
          }
        }
      }
      return { blocked: false };
    }
  };
}
var PROTECTED_UPLOAD_PATHS = [
  "/etc/shadow",
  "/etc/gshadow",
  "/etc/sudoers",
  "/etc/ssh/sshd_config"
];
function checkUploadPath(path) {
  const normalized = String(path ?? "").replace(/\\/g, "/");
  for (const protectedPath of PROTECTED_UPLOAD_PATHS) {
    if (normalized === protectedPath || normalized.startsWith(`${protectedPath}/`)) {
      return `\u62D2\u7EDD\u4E0A\u4F20\uFF1A${protectedPath} \u5C5E\u4E8E\u53D7\u4FDD\u62A4\u7684\u7CFB\u7EDF\u6587\u4EF6`;
    }
  }
  if (/\/\.ssh\/authorized_keys(\/|$)/i.test(normalized)) {
    return "\u62D2\u7EDD\u4E0A\u4F20\uFF1A\u4E0D\u5141\u8BB8\u8986\u76D6 ~/.ssh/authorized_keys";
  }
  return null;
}

export {
  createCommandGuard,
  checkUploadPath
};
