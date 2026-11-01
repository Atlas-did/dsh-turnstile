# 148 · 第三方检查器扩展契约

## 为什么需要它

此前新增检查必须修改 `preflight.mjs` 的核心表和 `selftest.mjs`。这使本地实验、团队内部规则和上游核心耦合，也让“支持扩展”停留在文档建议。

现在可以通过一份显式清单接入 Node.js 检查器，不修改核心代码；内置检查、外部检查共用选择、超时、报告、建议和阻断逻辑。

本轮仅在隔离副本与临时目录中验收，没有读取或修改真实 profile。

## 清单格式

```json
{
  "schema": "turnstile/checks@1",
  "checks": [
    {
      "name": "my-check",
      "script": "./my-check.mjs",
      "hint": "解释这个检查为什么重要",
      "advisory": false
    }
  ]
}
```

- `schema` 必须逐字为 `turnstile/checks@1`。
- `name` 使用小写字母、数字和连字符，不能与内置检查或其他扩展重名。
- `script` 相对清单所在目录解析，因此从其他工作目录调用也能找到同一个脚本。
- `hint` 可选，用于失败时解释检查目的。
- `advisory` 可选，默认 `false`。非零退出默认阻断；设为 `true` 后保留问题但不让总闸门失败。

无效 JSON、错误 schema、空清单、非法名称、重名和脚本缺失都在执行任何外部检查前拒绝，退出码为 2。

## 检查器契约

Turnstile 使用独立 Node.js 子进程执行：

```text
node <script> <profile> --json
```

检查器应在 stdout 输出一个 JSON envelope：

```json
{
  "checker": "my-check",
  "findings": [
    {
      "severity": "error",
      "message": "具体、可修复的问题",
      "plugin": "optional-package-name",
      "evidence": ["可核对的文件或观测"]
    }
  ]
}
```

退出 `0` 表示该检查器通过；非零表示发现问题或无法完成检查。`advisory` 只决定是否阻断，不会把问题状态伪造成通过。
每个检查器受现有 `DSH_CHECK_TIMEOUT` 和输出缓冲区约束，单个崩溃不会绕过统一报告。

## 使用

```bash
# 运行内置检查和清单中的外部检查
node tools/turnstile.mjs gate <profile> --checks <checks.json> --json

# 只运行一个外部检查
node tools/preflight.mjs <profile> --checks <checks.json> --only my-check --json

# 跳过某个已声明检查
node tools/preflight.mjs <profile> --checks <checks.json> --skip my-check --json
```

`checks[]` 中的 `source` 记录清单绝对路径；内置检查为 `builtin`。JSON stdout 和报告文件都包含 `blocking[]`，调用方不需要根据文本猜阻断来源。

## 安全边界

清单是**显式代码执行入口**，不是安全沙箱。只运行自己审查过的检查器。

Turnstile 不会自动发现或执行 profile 中的 `turnstile.checks.json`；没有 `--checks` 时，外部脚本不会进入闸门。不要把来源不明的清单当作普通数据文件打开后即运行。

## 内置贡献与本地扩展的区别

- 团队或个人的专用规则：优先使用清单，无需维护 Turnstile 分支。
- 准备进入上游的通用规则：除清单协议外，仍应提交必须触发问题的夹具、自检用例和内置注册，保证所有用户都能获得同等回归覆盖。

## 夹具验收

`npm run test:checks` 有 18 项断言，使用真实 preflight／统一 turnstile 子进程和临时 profile 覆盖：通过、阻断、建议、`--only`、相对脚本路径、来源记录、统一入口参数转发、完整 `data` 保留、finding 保留、错误 schema、内置重名、脚本缺失、坏 JSON、清单内重名、非法名称、缺少清单路径和禁止自动发现。

这些结果证明扩展协议在隔离夹具中按契约工作，不证明任何第三方检查器本身的规则正确，也不代表真实 mini 或桌面端验收。
