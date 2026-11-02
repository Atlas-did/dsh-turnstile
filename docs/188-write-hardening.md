# 批次一收尾：写路径加固、备份残留清理、隐私扫描扩围（2026-11-02）

## 1. `safeWritePatch` 三道加固 ✅

| 加固 | 行为 |
|---|---|
| 前置指纹 | 调用方给 `expected`（计划时算好的 hash），与当前内容不一致 → `STALE_PLAN`，不写、不留备份 |
| 写后读回 | 磁盘字节必须与准备写入的一致 |
| 不一致恢复 | 用写入前的内存快照还原，并抛出错误（错误里带备份路径） |

新增 4 条断言（总数 5 → 9）：

```
ok   前置指纹不一致 → 视为并发冲突，不写不留 bak
ok   前置指纹一致 → 正常写入
ok   写后读回比对通过（内容与期望逐字节一致）
ok   指纹函数对内容敏感、对换行差异敏感
```

途中修了自己一个 bug：`expected` 传进来的是指纹，我又哈希了一次 → 恒不相等。

## 2. `.bak-*` 残留清理 ✅

- `tests/manage-fixture/` 里 6 个被 git 跟踪的 `.bak-*` 已删除；
- `.gitignore` 增加 `*.bak-[0-9]*`，以后这类写入备份不会进仓库。

## 3. 隐私扫描扩到全仓库（D-04） ✅

`sanitize-docs.mjs` 从「只扫 docs/」扩成扫 `docs/ tools/ plugins/ skills/ tests/` + 根 `package.json`，
跳过 `node_modules/.git/state`，并导出 `findPaths()` 供测试使用。

顺带删掉一处真实默认路径：`compat-matrix.mjs` 原来写死作者机器的 mini 目录，
现在不传 `--mini` 就是 `unknown`（诚实优先）。

`test-privacy` 新增 3 条：

```
ok   能识别真实主目录路径   2
ok   占位符不算泄漏
ok   全仓库（docs/tools/plugins/tests/skills）无本机路径   0
```

测试自身的夹具也改成运行时拼接，否则扫描器会把自己当泄漏（第一次跑就是这么红的）。

## 验证

```
test:all              59 个套件 exit 0
test-compat-matrix    OK（rc.3 无 --mini 时也是 unknown）
```

## 批次一剩余

- 把 `expected` 真正接进 `manage.mjs` / `anchor.mjs`（dry-run 与 apply 之间传指纹）；
- 旧内联控制台的 `innerHTML` 拼接（D-09）；
- rc.4/rc.5/0.2.2-alpha.2 真实安装验证。
