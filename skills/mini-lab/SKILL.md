---
name: mini-lab
description: "Mini 实验场：插件试验台与作者工作间。提到「mini 实验场 / 管理 mini / 插件试验 / 拖不动 / 谁占了哪个角」时进入。只对 mini 负责，先只看不改，写操作留备份。"
---

# Mini 实验场（技能入口）

这是一个**模式**，不是一组命令。进入后固定按下面的形状工作。

## 三个对象（始终同时考虑）

| 对象 | 它关心什么 | 由此决定的动作 |
|---|---|---|
| **用户** | 装完还能不能干活 | 只给「判定 + 图 + 编号选项」，不让他读日志、不让他手改 YAML |
| **他电脑上的 DSH** | 结论对这个环境是否成立 | 任何结论必须落到真实 profile 上验证；静态推断不能当证据 |
| **插件作者** | 想改一点、试一下 | 同一个 mini 既能测也能写小实验插件（写—装—验—卸） |

默认工作区：`C:/Users/finef/Desktop/mini-harness`（用户可在设置里改）。

## 第一步：只看不改

```bash
node tools/preflight.mjs <mini profile> --no-record
node tools/occupancy.mjs <mini profile> --out state/occupancy-mini.json
```

输出必须是三块，不要贴原始日志：
1. **判定**：CLEAR 还是 BLOCKED，一句话原因；
2. **阻断项**：插件 + 哪个检查 + 证据（文件:行）+ 建议修法；
3. **位置占用**：哪些 UI 面被几个插件占，其中多少是硬编码（拖不动）。

## 第二步：给选项，等用户选

编号列出 1/2/3，不自作主张改配置。典型选项：
1. 停用某个插件；2. 调整某个插件的位置；3. 两个插件真不兼容 → 融合。

## 第三步：写操作规则（只有用户同意才做）

- 只用 `tools/manage.mjs` / `tools/anchor.mjs`，不手改 `cordis.patch.yml`；
- 每次写前自动留 `.bak`，写完提醒「重启 DSH 才生效」；
- 不碰 desktop profile。

## 第四步：冲突

先跑 `node tools/fuse.mjs <profile> --surface <ui-面>`（配置层融合）。
`exit 3` = 插件没暴露位置配置，动不了 —— 这时才谈源码级合并，并明确风险。

## 第五步：写实验插件（像油猴脚本那样小）

```bash
node tools/lab.mjs <profile> --install plugins/<name> [--anchor <值>]
node tools/lab.mjs <profile> --uninstall <name>
```

验证标准：`quicktest` 仍 10/10；新行为有可复现证据（截图用 `tools/capture.mjs`）。
卸载要真的卸干净（包目录、dependencies、bundles、patch 行）。

## 边界

- 恶意检测是顺手做的一项，不阻塞主线，默认不联网。
- 任何一步失败，先回滚再报告，不要带着半成品继续。
