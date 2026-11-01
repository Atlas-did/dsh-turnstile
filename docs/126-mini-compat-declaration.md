# 插件兼容 mini 的声明规范

> 你在 mini 里能不能跑，不该靠试。这份文档定义「一个插件要声明什么，才算 mini 可用」。

## 一、最小声明（必须）

```json
{
  "name": "dsh-xxx",
  "version": "1.0.0",
  "engines": { "dsh": ">=0.2.1-rc.2" },
  "dsh": {
    "client": { "inject": ["@deepseek-ai/dsh-client-ui-settings"], "platform": "web" },
    "bundle": { "patch": "./cordis.patch.yml" }
  }
}
```

| 字段 | 为什么必须 | 缺了会怎样 |
|---|---|---|
| `engines.dsh` | 版本闸门（`engines.mjs` 会据此跳过） | 版本不匹配也照装，启动时才炸 |
| `dsh.client.inject` | 决定注入哪些 UI 面 | 面板里看不到，`ui-atlas` 也统计不到 |
| `dsh.bundle.patch` | 决定插哪些配置行 | 插件装了但「没生效」 |

## 二、深度集成时额外声明（Windows 能力）

```json
{ "dsh": { "windows": { "uia": "read", "hotkeys": ["Ctrl+Alt+F12"] } } }
```

宿主只放行声明过的：`uia: 'read' | 'act'`、`input`、`fs`、`proc`，热键要列进 `hotkeys`。
没声明一律拒（`lib/windows-gate.js` + `tools/windows-gate.mjs --check`）。

## 三、装进 mini 之前必跑的四步

```bash
cd <home>/Desktop/mini-harness/oss/dsh-turnstile
PROFILE=<home>/Desktop/mini-harness/home/profiles/mini

node tools/risk.mjs $PROFILE          # peer-only scope / 装不活的风险
node tools/conflict.mjs $PROFILE      # ctx 服务名冲突、版本分叉
node tools/engines.mjs $PROFILE       # 版本闸门（会跳过哪些）
node tools/preinstall.mjs $PROFILE dsh-xxx   # 预检：能不能装、缺什么
```

四步全绿才 `pnpm add`；装完必须 **重启 mini** 并跑七项体检：

```bash
node tools/mini-ctl.mjs stop && node tools/mini-ctl.mjs start
node tools/quicktest.mjs mini 18770 <home>/Desktop/mini-harness/logs/mini.log
```

## 四、哪些插件「天然适合 mini」

| 类型 | 例子 | 为什么适合 |
|---|---|---|
| **纯技能型**（只有 SKILL.md，无 host 代码） | `grill`、`sp-*` 系列 | 不注入 UI、不抢 slot、零冲突；mini 装了直接可用 |
| 单一 UI 面、注入 1–2 处 | `dsh-meme`、`dsh-unlag` | 面少，冲突面小 |
| provider/model 类 | `dsh-commandcode-provider` | 只改设置面的一行 |

## 五、哪些要谨慎

| 类型 | 风险 |
|---|---|
| 一次注入 ≥4 个面的重集成插件（如 `@nanmicoder/dsh-agent-teams` 6 个面） | 容易和已有插件抢同一 slot，`ui-settings`/`ui-conversation` 已经 8–10 个了 |
| 自带 patch 且改同一批行 id | `patch` 的 `config` 是**整体替换**不是深合并 |
| 需要原生模块（node-pty、sharp） | mini 走 pnpm + 代理时容易下载失败（见 docs/02） |

## 六、给插件作者的 README 模板

```md
## mini 兼容性

- 需要 DSH：`>=0.2.1-rc.2`（已声明 engines.dsh）
- 注入 UI 面：ui-settings（1 处）
- 配置行：`xxx`（patch 文件：cordis.patch.yml）
- Windows 能力：无 / uia=read / hotkeys=Ctrl+Alt+K
- 已验证：mini（18770）安装 + 七项体检全绿（日期）
```

## 七、当前实际状态（2026-11-01）

- mini profile：28 bundles，UI 面 14 个，最挤 `ui-conversation 8` / `ui-settings 7`。
- 主 profile：36 bundles，18 个插件有 UI 注入，最挤 `ui-settings 10`。
- 已有能力：`ui-atlas`（谁抢哪个面）、`inspect-plugin`（单插件骨架）、`diff-plugins`（两插件差异）。
