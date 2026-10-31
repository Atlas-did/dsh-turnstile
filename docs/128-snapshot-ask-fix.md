# 补上三个设计缺口：对比 / 一句话 / 修复闭环

## 1. 装前装后对比 `tools/profile-snapshot.mjs`

```bash
node tools/profile-snapshot.mjs <profile> --take [--label "装之前"]
node tools/profile-snapshot.mjs <profile> --diff
node tools/profile-snapshot.mjs <profile> --list
```

实测（mini）：

```
快照已存 state/snapshots/2026-10-31T17-16-59-865Z.json
  28 个插件 · 22 个 UI 面 · patch 1519 字节 · 基线
```

diff 输出（用夹具验证）：

```
新增插件 b
UI 面变化  +1 ui-settings (1 → 2)   +1 ui-conversation (0 → 1)
配置体积  +26 字节 (26 → 52)
```

**测试 7 条**：take 落盘、diff 报新增、无移除、面计数变化、体积变化、list、只有一张时明确报错。

## 2. 一句话驱动 `tools/ask.mjs`

```bash
node tools/ask.mjs <profile> "把 dsh-whale 挪到左下角"        # 干跑
node tools/ask.mjs <profile> "停用 dsh-talk" --apply          # 真执行
```

**为什么用规则不用模型**：这些是写操作，误判一次就改坏配置。规则能解释（会打印「我是怎么理解的」），模型不能。

实测：

```
$ ask "停用 dsh-talk"
理解：看到「停用/禁用」 · 插件 dsh-talk
将执行：node tools/manage.mjs <profile> --disable dsh-talk
（干跑：加 --apply 才真的执行）

$ ask "谁占着 ui-settings" --apply
→ 直接跑 ui-surfaces，列出 ui-settings 7 个插件
```

支持 11 类意图：anchor / disable / enable / fix / snapshot-take / snapshot-diff / surfaces / inspect / conflict / diagnose / help。
缺包名时**给候选**（列出已装插件），不让人去翻 node_modules。

**测试 20 条**（纯函数，不执行）。

## 3. 一句话修复闭环

```bash
node tools/ask.mjs <profile> "修一下"            # 只出计划
node tools/ask.mjs <profile> "修一下" --apply    # 应用 + 复跑检查
```

实测（mini）：fix 应用后立刻跑 conflict，输出 `no conflict patterns found`。

注意：`fix.mjs` 目前只会真正应用 `npm-alias` 类修复（其余是建议），这条边界没变。

## 4. 一个顺手修的 bug

`ask --apply` 原本给**所有**命令追加 `--apply`，查询类工具（ui-surfaces / inspect-plugin）不认这个开关。
改成按工具决定：`manage` 用 `--yes`，`anchor`/`fix` 用 `--apply`，查询类不加。

## 5. 仍未做（如实）

- 自然语言里**中文插件别名**（如「鲸鱼娘」）解析不出包名——现在会提示给包名并列出候选；
- `fix.mjs` 的非 npm-alias 建议仍是「建议」，不自动改；
- 快照只存 profile 侧（插件/面/体积），**不存界面截图**。
