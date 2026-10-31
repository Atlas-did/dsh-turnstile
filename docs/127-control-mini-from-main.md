# 从主环境直接控制 mini（三种入口）

## 1. `mini-ctl`：命令行的总开关

```bash
cd /c/Users/finef/Desktop/mini-harness/oss/dsh-turnstile
node tools/mini-ctl.mjs status     # 运行中？端口？日志？
node tools/mini-ctl.mjs url        # 带 token 的地址（真机实测可点）
node tools/mini-ctl.mjs start      # 后台起，等到就绪才返回
node tools/mini-ctl.mjs stop
node tools/mini-ctl.mjs cmd "node tools/ui-atlas.mjs C:/Users/finef/Desktop/mini-harness/home/profiles/mini --csv C:/tmp/a.csv"
```

实测：

```
$ node tools/mini-ctl.mjs status
mini 运行中 · C:\Users\finef\Desktop\mini-harness
  url  http://127.0.0.1:18770/?token=…
  port 18770  日志 …/logs/mini.log

$ node tools/mini-ctl.mjs start     # 从「已停止」状态冷启动
已启动（pid 20680），等它就绪…
就绪：http://127.0.0.1:18770/?token=…
```

`cmd` 默认在 `oss/dsh-turnstile` 下跑（工具都在那），并注入 `DSH_HOME` / `DSH_TURNSTILE_STATE`。

## 2. 「mini 实验场」预设：对话里直接选

已创建：`~/.dsh/.agent-presets/mini-control/`

```
preset.yml         name: mini 实验场   order: 3
agent.cordis.yml   persona：唯一入口 mini-ctl + 工作流 + 红线
```

选了它，模型就以「操控 mini」为默认立场工作：

- 装/改插件按「三查 → preinstall → 重启 → quicktest」走；
- 没在 mini 验过的不推主 profile；
- 主环境只走 `patch-write.mjs`，删停必须先 dry-run + 确认。

**未验证**：这个预设是否出现在新建会话的预设选择器里，我没有重启主环境去确认（`~/.dsh/.agent-presets/` 是启动时扫描的）。

## 3. `mini-control` 技能：不需要预设也能触发

`~/.dsh/skills/mini-control/SKILL.md`，触发词：mini / 控制 mini / mini 里试 / 在 mini 装 / 推主环境。

已验证：它出现在本会话的技能目录里（`mini-control` 可被 `skill` 工具加载）。

## 4. 兼容更多插件：先看声明规范

`docs/126-mini-compat-declaration.md` 定义了插件要声明什么：

```json
"engines": { "dsh": ">=0.2.1-rc.2" },
"dsh": {
  "client": { "inject": ["…"], "platform": "web" },
  "bundle": { "patch": "./cordis.patch.yml" },
  "windows": { "uia": "read", "hotkeys": ["Ctrl+Alt+K"] }
}
```

**grill 这类纯技能插件天生适合 mini**：只有 SKILL.md，不注入 UI、不抢 slot、零冲突。
