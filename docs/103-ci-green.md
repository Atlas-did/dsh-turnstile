# CI 从红到绿：三个真 bug（都是 CI 替我发现）

加完 diagnose 测试后 CI 连红四次（run#76–80）。**没有一个是我本地能看到的**——这是 CI 的价值，
也是「只在本机跑过」的局限。

## 1. npm 生命周期撞名（run#76–79 全红）

我把脚本命名成 `preinstall`：

```
> dsh-turnstile@0.1.0 preinstall
> node tools/preinstall.mjs
usage: node tools/preinstall.mjs <profileDir> <package> [--json]
npm error code 2
```

**`preinstall` 是 npm 的保留生命周期钩子**，每次 `npm ci` 都会自动执行它；我的脚本需要两个参数，于是退出 2，
整条 CI 在「装依赖」这一步就死了——后面的测试根本没跑。

修法：改名 `check:preinstall`。教训：**npm 脚本名不能占用生命周期名**（preinstall/install/postinstall/prepare…）。

## 2. 语料被 .gitignore 吞掉（run#80）

`tests/corpus/2026-10-31/logs/**` 命中仓库的 `logs/` 忽略规则 → 只提交了 `manifest.json` 和 `labels.md`，
**12 个日志文件一个都没进仓库**。本地能过（文件在盘上），CI 上 A 用例直接失败。

修法：加两条否定规则：

```
!tests/corpus/**/logs/
!tests/corpus/**/logs/**
```

现在 `git ls-files tests/corpus | wc -l` = 15。

## 3. 匿名 export default 被我剥成了非法语句（run#80）

```js
// 剥完变成：
function () {}         // ← 函数声明必须有名字
// 修法：
const __default = function () {}
```

顺带修了另一个隐患：真 ESM（顶层 `import`/`export {}`）现在**跳过而不是判红**——
宿主注入的是经典脚本，用 ESM 包去判红只会制造假阳性（和 2026-10-31 的 75% 假阳性同一类错误）。

## 现状

```
run#81 (cf98d23)  completed success
CI 现在跑：selftest + ui fixture + ast fixture + diagnose(A/B/C/D/E) + records + pits + preinstall + proxy
```

## 我该早点做但没做的

**本地从没跑过 `npm ci`。** 如果我加完脚本后跑一次 `npm ci --dry-run`，第 1 个 bug 当场就会暴露。
已记入习惯：**改 package.json 的 scripts 后，本地先跑一次 `npm ci --dry-run`**。
