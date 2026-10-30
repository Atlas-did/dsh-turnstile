# Mini 实验场预设：现状与卡点（2026-10-30）

## 已经做到的

在 mini 的 `cordis.patch.yml` 里加了声明行：

    - insert:
        - id: preset-mini-lab
          name: '@deepseek-ai/dsh-agent-preset'
          config:
            id: mini-lab
            name: Mini 实验场
            order: 2
            plugins: [persona / agent-instructions / time-context / tool-fs / tool-fs-search / tool-jobs / tool-pwsh / skill-filesystem / tool-skill]

验证到这步为止：

    $ node bin.js mini --dump-config | grep mini-lab
    3031:- id: preset-mini-lab
    3034:    id: mini-lab

**声明已经进入合成配置**，YAML 合法，mini 能正常启动（quicktest 10/10）。

## 卡点：模式选择器里看不到它

headless 打开 mini → 点模式按钮，只读到三个内置项：

    标准模式 / PTC 模式 / 极简模式

这三个来自 `@deepseek-ai/dsh-web-app/presets/*.patch.yml`（standard / ptc / minimal），
由应用自身在启动时装配。

## 目前能确定的

1. 行确实进了 loader 的合成配置（dump 有）；
2. 选择器列表不是简单读「所有已注册预设」——新增 id 没有出现；
3. `dsh-web-app/presets/cordis.patch.yml` 的注释说得很明白：profile patch 的作用是
   **按 id 覆盖既有预设的 config.plugins**，不是新增预设。

所以 profile patch 这条路只能改，不能加。

## 下一步要查的

- `@deepseek-ai/dsh-agent-preset-registry` 的 `definitions` 由谁填充：目前只看到
  `register(definition)`，调用者需要进一步定位；
- UltraMath 声称会同步预设到 `~/.dsh/.agent-presets` 并被「dsh agent-presets loader」读取，
  但 mini 的选择器同样只显示三个内置项——说明**那个 loader 在 mini 里没生效**，
  这是一个可复用线索；
- 若确认新增预设必须走 bundle（像 UltraMath 那样随插件安装），就把 mini-lab 做成一个小
  bundle，而不是写进 profile patch。

## 结论

「Mini 实验场」的**内容**（persona、流程、默认工作区、写操作规则）已经写好并进入配置；
**入口**（出现在模式选择器）还没打通。在打通之前，这套规则可以照样用——
把 `docs/43-manage-mini-mode.md` 的提示块贴进任意会话即可，功能不缺，只是少了那个下拉项。
## 第二次尝试：做成 bundle（也失败，但排除了一个假设）

`@deepseek-ai/dsh-web-app` 的 `dsh.bundle.patch` 是**数组**——三个内置预设正是这样装进去的：

    "dsh": { "bundle": { "patch": ["./cordis.patch.yml", "./presets/standard.patch.yml", ...] } }

于是把 mini-lab 做成一个小 bundle（`plugins/mini-lab-preset/`，patch 数组里放预设行），
用 `tools/lab.mjs --install` 装进 mini：

    $ node bin.js mini --dump-config | grep -c preset-mini-lab
    1

配置里确实有，但模式选择器**仍然只有三个内置项**（实测 `has 实验场: false`）。

### 排除掉的假设

- 不是「profile patch 只能改不能加」的问题：换 bundle 投递同样不显示；
- 不是 YAML/字段格式问题：行进了合成配置，`config.id` / `name` / `plugins` 都在；
- mini 全程正常启动（quicktest 10/10）。

### 剩下的可能

1. 预设注册发生在 **agent plane**，需要 `agent-preset-registry` 的 `register()` 被某个宿主侧零件调用；
2. 客户端列表可能来自固定枚举（locale 里正好三个），不读注册表；
3. 自定义预设的正式入口是设置页的预设编辑器（`dsh-client-ui-agent-preset`），而不是配置文件。

第 3 条最可能是正解：那个客户端包里有一整套预设编辑/选择 UI。要打通，得看它把自定义预设存到哪。