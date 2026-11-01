# dsh-turnstile

DeepSeek Harness（下称 DSH）插件的**闸门 + 体检 + 实验场**工具集。

一句话：**装插件之前先过闸门，装完之后看得见它占了什么位置，坏了能回滚。**

> English: [README.en.md](README.en.md)

## 三条路径，别混

| 路径 | 是什么 | 什么时候用 |
|---|---|---|
| **主环境** | 你日常用的桌面 DSH（`~/.dsh/profiles/desktop`） | 只放**已经验证过**的东西 |
| **mini 实验场** | 这台机器上的第二套 DSH：独立 DSH_HOME、独立 profile、独立端口 | 装插件、改补丁、试 UI，**都在这里炸** |
| **仓库** | 本仓库的 tools（只读为主，写操作要显式开关） | 三查、体检、对比、推主环境 |

**mini 是这个项目真正的卖点**：它让你可以在一个**敢弄坏**的环境里做深层次工作，
验证通过再推主环境——而不是在主环境上一次一次试错。

## 最短路径（五条命令）

```bash
node tools/risk.mjs       <profile>
node tools/conflict.mjs   <profile>
node tools/engines.mjs    <profile>
node tools/preinstall.mjs <profile> <包名>
node tools/profile-snapshot.mjs <profile> --take --label 装之前
```

装完之后：

```bash
node tools/profile-snapshot.mjs <profile> --diff      # 变了什么
node tools/ui-surfaces.mjs      <profile>             # 谁占了哪个面
node tools/sandbox-promote.mjs --dry-run              # 推主环境前先干跑
```

全程**只读**，除非命令里带 `--apply` / `--yes`。

## 工具按「你想干什么」分组

### 查

| 工具 | 一句话 |
|---|---|
| inspect-plugin.mjs <profile> <pkg> | 一条命令出骨架：声明 / inject 面 / patch 行 / 入口 / slot / 类名 / 源码头 |
| diff-plugins.mjs <profile> a b | 两个插件差在哪（注入面 / patch 行 / 体积） |
| ui-surfaces.mjs <profile> | 每个 UI 面被哪些插件注入 |
| ui-atlas.mjs <profile> | 面 → 插件 → 条目矩阵，导出 HTML/CSV |
| slot-map-report.mjs --map <slot-map.json> | 运行时：每个插件插了哪些 slot、各几条 |
| slot-map-report.mjs --against old.json | 运行时：装前后哪个位置多了谁 |
| arch-graph.mjs <profile> | 架构图候选 JSON |

### 验

| 工具 | 一句话 |
|---|---|
| preflight.mjs <profile> | 12 项并行检查，每项独立超时 |
| risk / conflict / engines | 三查：装不活的风险 / 服务名冲突 / 版本闸门 |
| preinstall.mjs <profile> <pkg> | 装前预检 |
| selftest.mjs | 闸门自检：每个扫描器必须抓住自己的「必须报错」夹具 |
| diagnose.mjs --live | 从日志判「能不能连、能不能用、什么能证伪它」 |
| profile-snapshot.mjs --take/--diff | 装前装后对比 |

### 改

| 工具 | 一句话 |
|---|---|
| anchor.mjs | 改插件锚点（干跑默认，--apply 才写，留 .bak） |
| manage.mjs | 启停插件（写 loader 真正读的那一行） |
| fix.mjs | 发现 → 修复计划；只有 npm-alias 类会真应用 |
| ask.mjs | 一句话驱动上面这些，默认干跑 |
| windows-gate.mjs | Windows 能力闸门：声明才放行，判定写审计 |

### 推

| 工具 | 一句话 |
|---|---|
| sandbox-trial / verify | 在 mini 里试装并校验 |
| sandbox-promote --dry-run | 推主环境的 diff（必须先干跑给人看） |
| sandbox-snapshot / reset | 快照与回滚 |
| mini-ctl.mjs status/url/start/stop/cmd | 一句话操控 mini |

## mini 实验场怎么起

```bash
node tools/mini-ctl.mjs status     # 在跑吗？端口？
node tools/mini-ctl.mjs start      # 后台起，等到就绪才返回
node tools/mini-ctl.mjs url        # 带 token 的地址（打印最新那条）
```

装了本仓库的预设，新建会话时选 **mini 实验场** 就能直接对话操作；
不选预设也行——`mini-control` 技能用「mini / 控制 mini / 在 mini 装」就能触发。

## 为什么值得用

DSH 插件会改界面、抢同一批 slot、写同一份配置。出事时的典型症状：

- 「装完打不开对话」——某插件把 inspector 预算撑爆；
- 「按钮不见了」——两个插件注入同一 slot，后装的把前面的挤掉；
- 「改了没生效」——patch 行 id 写错，或 config 是整体替换不是合并。

这些不是「小心一点」能避免的。需要：装之前拦一道，装之后看得见，坏了能退。

## 它不会骗你：几条硬规矩

1. **未验证就标 unverified**，不写成「已支持」。
2. **绿色必须有意义**：每个扫描器带一个「必须报错」的夹具，夹具不红说明扫描器坏了。
3. **写操作两段式**：先出计划（diff），再确认写入，且留 .bak。
4. **退出码有意义**：0 通过 / 1 有问题 / 2 用法错误 / 3 前置条件不满足。

## 边界（先读这个再信任它）

- 它是**静态 + 运行时观测**工具，不是沙箱：不阻止插件干坏事，只在装之前把风险摊开。
- uia.act 这类「操作别的程序」的能力必须插件先声明 dsh.windows.uia，否则一律拒。
- mini 上能跑 ≠ 主环境一定行：桌面端有 inspector 通道和字节上限，推送前必须过 sandbox-promote --dry-run。
- 运行时归属靠 entry id 前缀；核心条目（bash / user）归不上是正常的。

## 目录

```
plugins/turnstile-popup/   体检面板 + 控制台 + 页面搭建器（DSH 插件形态）
tools/                     所有 CLI（查 / 验 / 改 / 推）
skills/                    可直接装进 DSH 的技能
docs/                      120+ 篇：机制笔记、证据、踩坑、上游阅读
tests/                     夹具与语料（含必须失败的对照）
```

## 文档入口

| 想了解 | 看 |
|---|---|
| 整体架构 | docs/01-architecture.md |
| 插件 UI 面地图 | docs/02-plugin-ui-map.md |
| mini 实验场 | docs/117 ~ docs/131 |
| 能力闸门 / Windows 集成 | docs/118、docs/119 |
| 运行时 slot 结构 | docs/130-runtime-records-shape.md |
| 每插件 × 每 slot 分布 | docs/131-slot-distribution.md |
| 安全修复记录 | docs/129-security-fixes-from-review.md |

## 许可

MIT。
