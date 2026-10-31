# GitHub 相关项目调研（2026-10-31 夜）

## 看过的仓库（元数据实测）

| 仓库 | 星 | 许可 | 最近推送 | 用途 |
|---|---|---|---|---|
| anywhere-labs/dsh-desktop | 34203 | MIT | 2026-10-31 | 桌面外壳 + profile 装配 + 36px frame |
| dsh-market/dsh-market | 9917 | MIT | 2026-10-30 | 插件市场（今天更新失败的来源） |

注意：raw.githubusercontent.com 在当前网络被 dev-sidecar 拦（返回 DevSidecar Error），
文档一律走 GitHub contents API 取（base64 解码）。
## architecture.md 读到的事实

1. Desktop 是薄 Electron 宿主：在 main 进程启动官方 DSH Host，Host 用 HTTP/WebSocket 提供 Web UI，没有另造 renderer IPC 插件系统。
2. profile 切换 = dispose 整个 generation；service reference、窗口对象、subprocess handle 都不能跨代缓存。
   解释了「装完插件必须重启」，也解释了运行中改插件不生效。
3. 兼容模式只通过 overlay slot 加一条 36 像素 Desktop frame，官方 layout/sidebar/conversation 从它下面开始。
   解释了桌面端与 CLI 的 UI 面差异。

## user-guide.md 读到的事实

1. 托盘菜单有 Profile 切换，切换会「有序重启」；新 profile 只有在 Host/窗口/客户端都起来后才记为
   最近一次可用 profile，失败会回退到上一次可用。
   含义：当前 profile 不等于最近可用 profile，我们的 profile 列表应该区分这两者（尚未实现）。
2. 切换 profile 不会复制插件；要管哪个 profile 必须在命令里显式写出。
   这解释了为什么 mini 的实验不会自动进主 profile。
3. 用文件夹启动：拖到图标或 dsh-desktop <folder>；exFAT/FAT32/网络盘不支持。

## 我们实际拿走的

| 拿到什么 | 落到哪里 |
|---|---|
| profile 切换会重启整个 generation | 写进 docs/faq/aa-bridge.md 与本文；工具不再承诺热加载 |
| 最近可用 profile 概念 | 环境管家后续要区分 current 与 lastKnownGood（未实现） |
| 36px frame + 官方 viewport | 解释 UI 面统计与视觉不完全一致；写进 docs/85 备注 |

## 没做的（如实）

- 没有克隆仓库到本地（只读了文档与元数据）。
- 没有读 dsh-market 的更新实现——那是「更新报错」的根因所在，属于下一步。
- 没有读 AA 的 connector 源码（不在公开仓库，装在安装包内，端点串搜不到）。
