# 想做「深度集成」的插件，还缺什么器材

> 从用户视角出发：他想做的不是「装个按钮」，而是**让 DSH 感知/操作真实的 Windows**。
> 这份清单按「用户想干的事」组织，每项给出：需要什么器材、现在有没有、我们缺哪一环。

## 一、先看这台机器有什么（可复跑）

```bash
node tools/windows-probe.mjs          # 人读
node tools/windows-probe.mjs --json   # 给程序读
```

本机（Windows 11 家庭版 10.0.26200）实测：

```
✓ 系统版本          Windows 11 家庭版 中文版 10.0.26200
✗ 当前是否管理员     False
✓ UI Automation     ok
✓ P/Invoke          Add-Type 可用，GetSystemMetrics=1600
✓ 事件日志可读        Microsoft-Windows-Security-SPP
✓ WebView2          156.0.4314.50
✓ 长路径已启用        1
✓ Sysinternals      handle, procexp, pslist
✓ 命名管道           可以 listen
✓ Windows App SDK   Microsoft.WindowsAppRuntime.1.5
缺的器材：当前是否管理员
```

**结论先说**：这台机器上「读/看/调 API」的器材基本齐（UI Automation、P/Invoke、命名管道、WebView2 都在），
缺的是**管理员权限**下的那几类（ETW 会话、部分进程操作）。

## 二、按「用户想干的事」拆需要什么

### 1. 「我要让插件读别的窗口里有什么」

| 器材 | 状态 | 说明 |
|---|---|---|
| **UI Automation**（UIA3） | ✅ 组件在 | 读控件树、找按钮、取文本；跨进程、不用管理员 |
| MSAA / IAccessible | ✅ 随系统 | UIA 覆盖不到的老控件（部分国产软件）走这条 |
| 屏幕 OCR / 截图 | ⚠️ 部分 | 我们有 `modlens`（视觉桥）和截图脚本，但**没有**做成「给插件用的 API」 |

**我们缺的一环**：把 UIA 包成插件能直接调的接口（现在没有任何 `ctx.windows.uia` 之类的东西）。

### 2. 「我要让插件操作别的程序」

| 器材 | 状态 | 说明 |
|---|---|---|
| Win32 `SendMessage`/`PostMessage` | ✅ P/Invoke 可用 | 点按钮、发快捷键（最轻） |
| `SendInput` / 键鼠模拟 | ✅ | 真实操作，但会抢用户焦点 → 需要「可中断」设计 |
| UI Automation 的 Invoke/TogglePattern | ✅ | 比坐标点击稳，优先用这个 |
| 进程/窗口枚举（EnumWindows） | ✅ | 找目标窗口 |

**我们缺的一环**：**权限与安全模型**。让插件操作别的程序 = 给它发键鼠，必须有：
① 用户显式授权（一次性/会话级）；② 作用域（只对某窗口）；③ 可随时中断（热键/超时）。
现在这三样一个都没有。

### 3. 「我要从别的程序里拿数据 / 打通」

| 器材 | 状态 | 说明 |
|---|---|---|
| **命名管道** | ✅ Node 原生可用 | 本机进程间最稳的通道（AA 桥就是这么走的） |
| 本地 HTTP（localhost） | ✅ | 我们已经在用；本机可用、跨源要 CORS |
| COM / OLE（Office、WMI） | ⚠️ 需验证 | PowerShell 能起 COM；Node 侧要 `winax`/`node-ffi` 之类的桥 |
| **ETW**（系统级事件流） | ❌ 管理员 + 专门库 | Windows 上最专业的诊断流；非管理员拿不到内核 provider |
| Windows 通知 / Toast | ⚠️ | 有 WinAppSDK 运行时，但没接 |

### 4. 「我要在自己的窗口里嵌 UI」

| 器材 | 状态 | 说明 |
|---|---|---|
| WebView2 | ✅ 156.x | 嵌自己的 Web UI（我们现在的面板是宿主内的，没有独立窗） |
| WinUI 3 / Windows App SDK | ✅ 运行时在 | 原生窗、托盘、通知 |
| 多显示器 / DPI 感知 | ⚠️ | 有 P/Invoke 就能读，但没做「高 DPI 下不糊」的适配 |

### 5. 「我要在系统层兜住故障」

| 器材 | 状态 | 说明 |
|---|---|---|
| 事件日志读取 | ✅ | 插件崩溃可写系统日志，便于事后查 |
| 进程监视（procmon/ETW） | ⚠️ | Sysinternals 在，但要人工用；没做成插件可调 |
| 文件/注册表监视（ReadDirectoryChangesW） | ✅ P/Invoke 可达 | 监听 profile 变化（热重载的前提） |

## 三、我们真正缺的「器材」，按优先级

| # | 缺什么 | 为什么它排前面 | 最小可行做法 |
|---|---|---|---|
| 1 | **授权 + 作用域 + 可中断**的 Windows 能力网关 | 没有它，任何「操作别的程序」都是危险默认值 | 一个 `ctx.windows.request(action, scope)`，返回带超时与热键中断的句柄 |
| 2 | **UIA 的插件级 API** | 深集成 80% 的需求是「读/点别的窗口」 | `tools/uia.mjs`（PowerShell 后端）+ 插件侧薄封装 |
| 3 | **窗口/进程枚举与句柄信息** | 用户第一句常是「那个窗口是谁」 | 已有 Sysinternals；包一层稳定 JSON |
| 4 | **文件/注册表变更监听** | 想「改了立刻生效」就得监听 | P/Invoke `ReadDirectoryChangesW` |
| 5 | **ETW**（只在需要时） | 重量级、需要管理员 | 先不做，等有明确需求 |

## 四、从「用户怎么做一个深集成插件」倒推我们要提供什么

用户现在的路径：读文档 → 写插件 → 装进 profile → 重启 → 试。**每一步都缺器材**：

| 步骤 | 他需要 | 我们有 | 缺 |
|---|---|---|---|
| 找灵感 | 现成能力清单 | `docs/110` 机制清单、`docs/111` 上游项目 | 没有「Windows 能力 → 插件用法」的菜谱 |
| 写代码 | 能调系统能力的 API | 只有 `ctx.webServer` / `ctx.slots` | **没有 windows 能力层**（第 1、2 项） |
| 试插件 | 隔离环境 | ✅ `sandbox-trial` / `snapshot` / `promote` | — |
| 调试 | 看请求/看日志 | ✅ 控制台 + diagnose | 没有「插件调用系统能力的审计日志」 |
| 发布 | 打包 + 门禁 | ✅ preflight / builder-export | 缺「声明需要哪些系统能力」的 manifest 字段 |

## 五、我建议的下一步（三件，按顺序）

1. **`tools/uia.mjs`**：用 PowerShell 后端读/点 UI 元素，输出稳定 JSON；先做只读（读控件树/取文本）。
2. **能力网关草案**：插件 manifest 里声明 `windows: { uia: 'read' }`，宿主按声明放行；无声明一律拒。
3. **菜谱文档**：`docs/119-windows-recipes.md`，一条一个场景（读微信输入框？点安装按钮？拿 Excel 单元格？）。

## 六、这份文档的边界

- 探测项都是**只读**，不改系统；数值是本机实测（2026-10-31）。
- 我没有逐个测试 UI Automation 对具体软件的兼容性（有的应用不暴露 UIA 树），那需要按目标软件单独验。
- ETW / COM 的结论基于「需要管理员或额外桥接」这一通用事实，本机未实测（管理员项已实测为 False）。
