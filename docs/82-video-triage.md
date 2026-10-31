# 一个 B 站视频里的三个 DSH 故障，对着我们的工具逐条查

来源：`C:\Users\finef\Videos\bilibili\43191699963`，`BV1rNxB6CE4G`，125 秒，
标题《DeepSeek Harness 打不开（Web authentication failed）、插件更新报错、插件装不上怎么修》。
文字取自 B 站字幕接口（84 段），不是听写猜的。

## 视频说的三个问题

| # | 症状 | 视频给的原因 | 视频给的修法 |
|---|---|---|---|
| 1 | 打开就弹 `Web authentication failed`，点重启/退出都没用 | 每次启动换一个端口 → 存一条新的登录记录（名字和端口绑定，默认 30 天）；攒到约 70 条超过上限 | 退出 → 打开那个文件夹 → **删掉两个文件** → 重开，账号仍在 |
| 2 | 插件更新报错「更新前的构件未能验证」 | 插件已安装时 harness 不允许再装一遍，而插件市场的更新就是这么做的 | 卸载插件市场 → 添加插件 → 重新安装 → 启用 → 再更新 |
| 3 | 插件装不上，提示不兼容 | 作者把 `engines` 写死在两个旧版本上 | 装作者后来出的新版本 |


## 逐条对我们的工具（以下输出都是本机实跑）

### 问题 1：登录记录攒爆 → 打不开

我们**原来没有**这个检查。本轮新增 `tools/auth-records.mjs`：

```
node tools/auth-records.mjs            # 数本地端口的登录记录，超过 60 条就报警
node tools/auth-records.mjs --prune    # 删掉它们（先备份 Cookies 到 .bak-<时间戳>）
node tools/auth-records.mjs --json     # 机器可读
```

它读的是桌面端 Electron 的 cookie 库（`%APPDATA%\@deepseek-ai\dsh-desktop\...\Network\Cookies`），
把 `host_key` 里的端口分组计数。本机实跑：

```
login records for local hosts: 0 (limit 60)
  ~\AppData\Roaming\@deepseek-ai\dsh-desktop\Partitions\dsh-platform-...\Network\Cookies  0 records across 0 port(s)
  locked (DSH is running): ~\AppData\Roaming\@deepseek-ai\dsh-desktop\Network\Cookies
within the limit
```

**本机现在是 0 条，说明这台电脑没踩上这个坑**；同时主库被正在运行的 DSH 锁住，工具如实报告
`locked` 而不是假装读到 0 条。这一点很重要：真出问题时 DSH 打不开、进程已退，库就是可读的。

4 条夹具测试（`tools/test-auth-records.mjs`，用合成 SQLite，不依赖真实 profile）：

| 断言 | 证明 |
|---|---|
| 少量记录 → 不报警，退出 0 | 阈值以下不打扰 |
| 70 条 → `over: true`，退出 1 | 就是视频里那台机器的状态 |
| 按端口分组，其他站点不计入 | 只删本地记录的前提 |
| `--prune` 只删本地记录、留备份、删完不报警 | 不会误删登录态，可回滚 |

### 问题 2：插件更新失败（已安装时不允许覆盖装）

我们**不能**从命令行看到市场那条报错，但**能做同样的修复动作**，而且带事务：

```
node tools/manage.mjs <profile> --list          # 看清装了什么、哪一行是它
pnpm remove <plugin> && pnpm add file:<path>    # 卸载再装 = 视频里的修法
node tools/preflight.mjs <profile>              # 12 项检查，确认没留下冲突
```

这条路已在 `docs/76` 里用**一次性 profile** 跑过：装 → 检查 `clear to install` → 卸 → `bundles: []`、
`node_modules` 无残留、再检查仍 `clear to install`。

**缺口**：没有「这条更新会被拒绝」的事前检测——那需要读插件市场的更新逻辑，属于它的内部行为。

### 问题 3：插件装不上（作者把 engines 写死）

**能查**，而且已经查到了实例：

```
$ DSH_BIN=.../runtime/node_modules/@deepseek-ai/dsh/lib/bin.js \
  node tools/engines.mjs <mini profile>
{"runtime":"0.2.1-rc.3","bundles":26,"skipped":[],"exempted":["dsh-talk@0.3.15"]}
```

`dsh-talk@0.3.15` 就是「声明只认旧版本、当前 harness 不满足」的那一类，被引擎闸门挡在外面。
桌面 profile 同样跑过：29 个 bundle、0 个被跳过。

**缺口**：输出里叫 `exempted`，对用户不够直白；也没有把「它声明了什么版本范围、当前是什么版本」
并排打印出来。这是文案与信息完整度的问题，不是能力缺失。
## 再遇到同类问题、又没有视频，能不能快？

能的部分，靠的是「每个检查都说清原因 + 下一步命令」，而不是靠某个未卜先知的按钮：

```
打不开 / 启动异常     -> node tools/auth-records.mjs        （登录记录多少条、要不要 --prune）
插件装不上            -> node tools/engines.mjs <profile>    （谁被引擎闸门挡了）
插件冲突 / 位置打架   -> node tools/preflight.mjs <profile>  （12 项，advisory 会说清哪一条）
想知道整体状态        -> node tools/doctor.mjs --dir <profile>
想看界面被谁抢        -> node tools/gate-map.mjs <profile>   （可点的拓扑图）
```

不能的部分，如实说：

1. **问题 2 的事前预测**——「这条更新会被拒」需要读插件市场的更新实现，我们只能事后修（卸载重装）。
2. **问题 1 的自动发现时机**——DSH 正在跑时 cookie 库被锁，工具只能报 `locked`。真正需要它的时候
  （打不开、进程已退）是可读的，但如果你是在「还能开、只是偶尔弹框」的阶段，得先退出 DSH 再查。
3. **问题 3 的根治**——`engines` 是作者写死的，我们能查出来并告诉你「它只认什么版本」，不能替你改
  别人的 manifest。

## 结束语（写给未来的自己）

这个视频值得学的不是三个修法，而是它的**诊断顺序**：先确认是不是端口/记录问题（重启无效 → 换端口
→ 记录累积），再确认是不是「已安装状态」导致（更新失败 → 卸载重装），最后才怀疑版本。
我们的工具现在能覆盖这三步里的两半步；剩下那半步（市场更新的内部判定）是别人的代码。
