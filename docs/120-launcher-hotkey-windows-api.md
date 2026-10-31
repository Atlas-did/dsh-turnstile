# 启动器 / 全局热键 / ctx.windows（第一轮）

## 1. Everything 式启动器

```bash
node tools/launcher.mjs index --root <dir> [--max 20000]
node tools/launcher.mjs search --q "dsh" [--limit 10] [--json]
node tools/launcher.mjs open --path <file>
```

实测：仓库根建索引 **364 条 / 42ms**（跳过 16 个目录：node_modules、.git、AppData…），
搜 `launcher` 命中 2 条，评分 799 / 798。

评分规则（`lib/launcher-index.js`，纯函数）：完全匹配 1000 → 前缀 800 → 包含 600 → 路径包含 400 → 词首缩写 300 → 子序列 150。

**没做的**：没有读 NTFS USN 日志（那要 P/Invoke），是「走目录全量 + 跳过规则」；
增量更新（`--incremental`）还没实现。

## 2. AutoHotkey 式全局热键

```bash
node tools/hotkey.mjs --profile <dir> --plugin <pkg> --specs "Ctrl+Alt+F12" --seconds 15 --self-test
node tools/hotkey.mjs … --run "node tools/launcher.mjs search --q dsh"
```

**三条规则**（与 uia.act 同构）：

1. 不带 `--profile/--plugin` 直接拒（exit 3）；
2. 插件必须在 `dsh.windows.hotkeys` 里声明该组合；
3. 注册与触发都写审计。

实测：

```
已注册 Ctrl+Alt+F12（10s 内有效）
触发 Ctrl+Alt+F12 · 15:49:16
宿主结束，共触发 1 次
```

实现：`tools/hotkey-host.ps1` 里用 C# `NativeWindow` + `RegisterHotKey` + `WM_HOTKEY`，PowerShell 侧 DoEvents 泵消息。

## 3. ctx.windows（宿主内共享 UIA 客户端）

```js
import { windowsApi, setAuditPath } from './lib/windows-api.js';
setAuditPath('<state>/windows-audit.jsonl');
const win = windowsApi({ plugin: 'p', pkg: myPackageJson });
await win.listWindows();        // 只读，记审计
await win.focus('窗口标题');     // 操作类，必须声明 uia=act
```

**关键收益**：一个常驻 UIA 进程被所有插件共用。

实测：首次 1253ms（含握手）→ **第二次 192ms**（约 6.5 倍）；
只声明 `read` 的插件调用 `focus` → 抛错「插件只声明了 uia=read，这次需要 act」。

## 4. 这一轮抓到的三个真 bug（都写进代码注释）

| bug | 现象 | 修法 |
|---|---|---|
| PowerShell `try` 是语句不是表达式 | 异常分支自己再抛错，**永远不回包** → 客户端只能超时 | 先存 `$reqId` 再构造哈希表 |
| `.ps1` 无 BOM 时按 ANSI 读 | 脚本里的中文拆坏引号，整个脚本解析失败 | `.ps1` 里一律 ASCII，中文只留 JS 层 |
| `[Console]::In` 按本地代码页解码 | 中文窗口名变「鎻掍欢涓嬭浇」→ 永远找不到元素 | 开头设 `InputEncoding = UTF8` |

第三个尤其隐蔽：英文窗口名（OpenCode）能跑，中文全挂。

## 5. 已知边界

- `focus` 返回的 `foregroundMatches` 可能是 false（Windows 前台锁），我们如实返回，不假装成功。
- 启动器索引是目录遍历，不是 USN；大目录（>2 万文件）需要 `--max` 兜底。
- `ctx.windows` 是「共享常驻进程」，不是原生绑定；真要 ms 级再考虑原生模块。
