# 插件装不上，提示不兼容

**症状**：`dsh plugin add <包>` 或插件市场里安装被拒，说当前版本不兼容。

**原因**：插件作者在 manifest 里把 `engines.dsh` / `dsh.compatibility.dshReleases` 写死在特定版本区间，
当前 harness 不在区间内。这不是你的配置错，是**包自己的声明**。

**怎么查**：

```
DSH_BIN=.../dsh/lib/bin.js node tools/engines.mjs <profileDir>
```

输出里 `skipped` / `exempted` 会点名被闸门拦下的包。本机实例：

```json
{"runtime":"0.2.1-rc.3","bundles":26,"skipped":[],"exempted":["dsh-talk@0.3.15"]}
```

**修法**：装作者支持当前版本的新版本；作者没更新就只能等，或换 harness 版本。**不要改别人的
manifest** 绕过检查——那是把别人的兼容性声明当废纸。

> 我们自己的插件怎么做的：`dsh.compatibility.dshReleases` 里只给实测过的版本标 `compatible`，
> 没跑过的写 `unknown`（见 docs/57、docs/76）。
