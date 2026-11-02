# 风险 finding 标准化（方案 03-A 第一步，2026-11-02）

## 每条 finding 现在带

| 字段 | 值 |
|---|---|
| `ruleId` | `risk.peer-only-scope` / `risk.undeclared-scope`（稳定，不随文案变） |
| `subject` | `{ kind: 'plugin', id: '<name>' }` |
| `locator` | `{ file: 'node_modules/<name>/package.json', line: null }` |
| `strength` | `static-ast`（说明这条结论只来自静态扫描） |
| `falsifier` | 「在真实宿主里 import 成功…可推翻这条静态结论」 |
| `fix` | npm alias 建议（原有） |

## 两条纪律

- **行号不知道就写 `null`**：原来我把 `lastEvidence` 标签（`ast`）当成文件名，输出里出现过 `"file": "ast"` —— 这是错的，已修。
- **severity 只用 error/warning**：内部色阶 `RED/AMBER` 只留在 `level` 字段给老消费者。

## 测试（9 条，新增套件）

```
ok   finding 有稳定 ruleId
ok   finding 有可定位对象
ok   locator 不编造行号   null
ok   finding 标明证据强度   static-ast
ok   finding 给了推翻条件
ok   干净夹具不产生 RED findings   0
```

## 验证

```
test:all   63 个套件 exit 0
```

## 仍未做

- 控制台里 finding 还不能跳到文件（`locator.file` 已具备，UI 未接 `vscode://file/...` 链接）；
- 每条规则的**正负夹具成对**还没有专门目录组织（现有 `risk-fixture` 是正向）。
