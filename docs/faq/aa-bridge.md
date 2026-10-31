# AA 一直显示「等待本地 bridge」

**症状**：Agents Anywhere 里 DSH 那一行是「启动中」，文字是「正在等待本地 DSH Bridge；请启动 DSH
并启用手机连接插件」。手机端连不上。

**原因**（两条，按概率排序）：

1. **DSH Desktop 自带这个插件，不需要 npm 装。** 插件 README 原文：「DSH Desktop 已集成此插件，
   不需要另行下载或执行 npm 安装命令」「不要对内置插件叠加独立 npm 安装」。所以问题不是没装，
   而是**没启用**。
2. `~/.agents-anywhere/dsh-bridge/connector.json` 存在，也不代表 DSH 侧通了——AA 桌面端自己也会写
   这个文件（`connector-runtime.json` 里 `kind: desktop-workbench`）。两边的桥是分开的。

**修法**：DSH 左侧「设置」上方找 **远程控制**（部分版本在「桌面设置 → 手机连接」）→ 打开 → 选
Agents Anywhere Cloud → 浏览器里登录授权 → **完全退出 DSH 再重开**。几秒内 AA 里会从「启动中」
变成「运行中」。

**验证**：`node tools/setup-check.mjs` 里 bridge 那一项从 FAIL 变 PASS。

> 注意：`endpoint.json` 与 `connector.json` 不是同一个文件，看错会得出相反结论。
