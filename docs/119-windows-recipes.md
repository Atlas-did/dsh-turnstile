# Windows 深集成菜谱（一条一个真实场景，都在本机跑过）

> 每条都给：什么时候用、命令、本机实测输出、以及「插件里怎么用」。
> 只读优先；凡是要操作别的程序的，先过能力网关（`windows-gate`）。

## 0. 先看这台机器有什么器材

```bash
node tools/windows-probe.mjs
```

本机结论：UIA / P-Invoke / 命名管道 / WebView2 / Sysinternals 都在，缺管理员权限。

## 1. 找窗口：「那个窗口叫什么」

```bash
node tools/win-enumerate.mjs --windows
```

实测（节选）：

```
顶层窗口 45 个
   45500  (无名)
    8456  桌面 agent
   33304  插件下载慢能否走代理 — DeepSeek Harness
```

## 2. 读窗口里的控件：「这个窗口有哪些按钮」

```bash
node tools/uia.mjs tree --pid 33304 --depth 2 --max 25
```

实测（节选）：

```
控件树 25 个节点
  Window · 插件下载慢能否走代理 — DeepSeek Harness  pid=33304
  Pane · 插件下载慢能否走代理 — DeepSeek Harness  pid=33304
  Button · 最小化  pid=33304
  Button · 恢复    pid=33304
  Button · 关闭    pid=33304
```

**这就是深集成的第一块砖**：知道窗口里有什么，才谈得上「帮我点那个按钮」。

## 3. 按名字找控件

```bash
node tools/uia.mjs find --name "插件下载慢能否走代理 — DeepSeek Harness"
```

```
匹配 3 个
  Window · 插件下载慢能否走代理 — DeepSeek Harness  pid=33304
  Pane · 插件下载慢能否走代理 — DeepSeek Harness  pid=33304
```

## 4. 看谁占着文件：「这个进程打开了什么」

```bash
node tools/win-enumerate.mjs --handles 33304
```

实测（节选）：

```
  58: File  D:\Software_download_link\softwaare\Programs\DeepSeek Harness
 240: File  D:\...\DeepSeek Harness\icudtl.dat
```

> 依赖 Sysinternals 的 `handle.exe`；不在 PATH 时会明确报「缺器材」，不会假装没有句柄。

## 5. 知道 profile 什么时候被改

```bash
node tools/watch-changes.mjs <profileDir> --interval 400 --duration 3
```

实测（改一个文件、加一个文件）：

```json
{"at":"...","path":"a.txt","event":"changed","size":2}
{"at":"...","path":"b.txt","event":"added","size":2}
```

**实现说明**：这是轮询（默认 400ms），不是 `ReadDirectoryChangesW`。
对「profile 变了就刷新」够用；要毫秒级再换原生。

## 6. 让插件「合法」地用这些能力

插件在自己的 `package.json` 里声明：

```json
{ "dsh": { "windows": { "uia": "read" } } }
```

然后：

```bash
node tools/windows-gate.mjs <profile>                 # 谁声明了什么
node tools/windows-gate.mjs <profile> --check <pkg> uia.read
node tools/windows-gate.mjs <profile> --audit --last 20
```

实测：

```
ALLOW  reader-x → uia.read      已声明 uia=read，允许 uia.read
DENY   reader-x → uia.act       插件只声明了 uia=read，这次需要 act（点按钮/输入文本）

2026-10-31 15:32:46  allow reader-x  uia.read  — 已声明 uia=read，允许 uia.read
2026-10-31 15:32:46  deny  reader-x  uia.act   — 插件只声明了 uia=read，这次需要 act
```

**没声明 = 全拒**。默认应该是这个样子。

## 7. 插件里怎么写（骨架）

```js
// 1) 先过闸门（把判定结果给用户看，别默默失败）
const verdict = decide(declared(myPkg), 'uia.read');
if (!verdict.allow) return { error: verdict.reason };

// 2) 再用能力（当前是子进程调用，稳定 JSON）
const { execFileSync } = require('node:child_process');
const windows = JSON.parse(execFileSync(node, ['tools/win-enumerate.mjs', '--windows', '--json']));
```

## 8. 已知边界

- UIA 对部分软件（自绘 UI、游戏、部分国产客户端）读不到控件树——那里只能退到截图 + OCR。
- `uia.act`（点/输入）**实现了网关，但还没实现动作本身**：现在能判定、能审计，还不能替你点。
- 句柄枚举依赖 `handle.exe`，不是内置能力。
