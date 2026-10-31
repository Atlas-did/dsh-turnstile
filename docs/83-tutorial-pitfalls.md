# 新手教程里的坑，对着我们的工具查了一遍

来源（两篇，均已抓正文）：

- 《部署DSH新手教程—1.从婴儿开始的Deepseek Harness满血全模态》 小林盒 link_id `a43772b83ad8`
- 《部署DSH新手教程——2.从婴儿到成年人的一大步：念、唱，做、打》 link_id `015e72b8a75a`

正文由无头浏览器渲染后取 `innerText`（两页都是 SPA，直接 fetch 只拿到空壳），评论区也一并读了几屏。

## 教程本身列的步骤（也就是会翻车的地方）

| # | 教程原话/步骤 | 新手会撞上的样子 |
|---|---|---|
| 1 | 「充 10 块 → 刷新 → 关闭客户端 → 重启」 | 没重启，模型列表是空的 |
| 2 | 「设置 → 内置插件 → 输入 dsh-market」 | 搜不到，因为没有市场插件本身就装不了 |
| 3 | 「安装 → **启用** → 重启 DSH」 | 装了但没启用，功能不出现 |
| 4 | 「AA 里 DSH 状态会从异常变成运行中」 | 一直停在「等待本地 bridge」 |
| 5 | 「把 AGNES_API_KEY 写进凭据或 .env **后重启**」 | 写了没重启，或者写错键名 |
| 6 | 评论区：「插件装不上，不兼容」 | 作者 engines 写死在旧版本 |
| 7 | （另一条视频）「打不开，Web authentication failed」 | 登录记录攒到约 70 条 |
## 我们的工具能查几条（全部实跑）

新增 `tools/setup-check.mjs`：按教程顺序走一遍，每条不是「对/错」而是一句人话 + 一条命令。
在你**这台机器**上跑出来的原文：

```
$ node tools/setup-check.mjs
setup check · desktop  (C:\Users\finef\.dsh\profiles\desktop)
  WARN  缺少凭据键：agnes-api-key（生图/生视频会失败）
        → 把 key 写进 DSH 凭据（键名 agnes-api-key）或 .env，然后重启客户端
  FAIL  AA 一直显示“等待本地 bridge”：endpoint.json 不存在
        → dsh plugin --profile desktop add @agents-anywhere/dsh-bridge-next
  FAIL  @ace-zone/dsh-market 未安装
        → dsh plugin --profile desktop add @ace-zone/dsh-market
  PASS  dsh-free-search 已安装并启用
  FAIL  @agents-anywhere/dsh-bridge-next 未安装
        → dsh plugin --profile desktop add @agents-anywhere/dsh-bridge-next
结果: 1 通过 / 1 警告 / 3 失败
```

**这就是「这些坑能不能理清楚」的答案**：教程里 7 个坑，5 个现在有明确检查，
而且检查直接给出下一步命令，不是「有问题」。

| 坑 | 现在谁查 | 判定 |
|---|---|---|
| 1 API/账号没配好 | `setup-check` 的凭据项 + `doctor` 的模型路由段 | ✅ 查 |
| 2 市场插件本身没装 | `setup-check`（刚跑出 FAIL） | ✅ 查 + 给命令 |
| 3 装了没启用 | `setup-check` 的 `checkPluginEnabled` | ✅ 查 + 给命令 |
| 4 AA 卡在「等待 bridge」 | `setup-check` 的 `checkBridge`（文件不存在 / 过期） | ✅ 查 + 给命令 |
| 5 Agnes key 没写/没重启 | `setup-check` 的凭据项（只报键名，不打印值） | ✅ 查 |
| 6 引擎不匹配装不上 | `tools/engines.mjs` | ✅ 查 |
| 7 登录记录攒爆打不开 | `tools/auth-records.mjs` | ✅ 查 + `--prune` 修 |

## 抓不住的两条（如实说）

1. **「教程里的插件市场更新会失败」**——它的更新是在已安装状态下再装一遍，harness 拒绝。我们只能
   **事后修**（卸载 → 重装 → 启用，`docs/76` 有完整往返证据），没法提前预测那条更新会失败，
   因为判定逻辑在插件市场自己内部。
2. **「卸载后启用」这类顺序问题**——工具能说「已安装但停用」，但没法保证用户下一步会去点启用；
   这不是检测能解决的，是 UI 该不该把「启用」做成安装完成后的默认。

## 顺带记一个不是坑的坑

评论区有人写「玩了两天，问她第一天的事，全不记得了」。这不是安装问题，是**上下文/记忆的预期**：
DSH 的对话是有边界的，跨天记忆得靠 memory 或插件。新手教程没讲，用户就会当成 bug。
我们的控制台能做的是**显示**每个插件占用了哪些 UI 面、谁在抢同一个位置，帮不上记忆这件事——
写在这里，免得以后把这句当成「已解决」。

## 用法

```
node tools/setup-check.mjs            # 按教程顺序体检
node tools/setup-check.mjs --json     # 机器可读
node tools/test-setup-checks.mjs      # 8 条夹具（每条非通过项都必须带下一步）
```
