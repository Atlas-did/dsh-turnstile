# 隐私与安全审查的处置（2026-11-01）

外部审查结论是「基本安全、无后门」。这轮把它点出的四处逐条处理，并让它们能被 CI 持续检查。

## 1. docs 里的本机绝对路径 ✅ 已清

`C:/Users/<user>/...` 与 `/c/Users/<user>/...` 两种写法共 **22 处**，分布在 14 篇文档。

新增 `tools/sanitize-docs.mjs`：

```bash
node tools/sanitize-docs.mjs          # 扫描，有命中就 exit 1
node tools/sanitize-docs.mjs --apply  # 替换成 <home>
```

顺带删掉了文档里作者用户名的那句括注。**现在 `grep -r finef docs` 为空。**

## 2. `eval`-like 代码 ✅ 已换掉

| 文件 | 原来 | 现在 |
|---|---|---|
| `js-expr-lint.mjs` | `new Function('return (' + expr + ')')` | `acorn.parseExpressionAt(...)` |
| `pits.mjs` | `new Function(stripped)` | `acorn.parse(stripped)` |

两者本来就只做**语法检查**（构造 Function 不执行函数体），但换成解析器后，代码里再也没有
「看起来像在 eval」的写法，审查工具也不会再误报。

## 3. 监听地址 ✅ 本来就是 127.0.0.1

`console-server` 一直是 `arg('--host', '127.0.0.1')`，全仓没有 `0.0.0.0`。
现在有测试锁住这两点。

## 4. URL 里的 token ✅ 可以用请求头替代

插件侧鉴权新增 `x-turnstile-token` 请求头（与建站时的 `x-dsh-token` 并列），
客户端在有 token 时**同时**带头和查询参数——页面地址里没有 token 也能工作，
不必让令牌只活在 URL/历史记录里。

## 回归测试 `tools/test-privacy.mjs`（6 条）

```
ok  docs 里没有本机绝对路径
ok  js-expr-lint 代码里没有 new Function
ok  pits 代码里没有 new Function
ok  console-server 默认只监听 127.0.0.1
ok  console-server 没有 0.0.0.0 默认值
ok  令牌也可以用请求头传（不必留在 URL）
```

`test:all` 现在会先跑一次 docs 脱敏扫描，再跑这些断言（38 套件）。

## 仍未做

- `state/` 下的运行产物（gate-history 等）含本机路径，但它们**不进 git**（已确认未被跟踪）；
- 文档里还有别的主机名/临时目录，属中性信息，未处理；
- 报告里提到的 `fuse.mjs` 删除行为没有改动（它先写 `.bak`），但文档里已提示备份。
