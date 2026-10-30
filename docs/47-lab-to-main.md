# Lab -> main: the promote pipeline (no dragging in the live environment)

Dragging a plugin around the **main** profile is a bad idea: the main profile is the user's
working environment, and a bad drop is a broken day. So the interaction splits in two:

    mini (lab)  --->  promote plan  --->  user reads it  --->  main profile
    可视化操作            diff 清单          逐条解释/确认       留备份、可回滚

## The three steps

1. **在 mini 里做实验** - 拖动、改位置、开关、装实验插件。mini 可以随便坏。
2. **算改动清单** - `tools/promote.mjs` 对比「实验室基线」与「现在的 mini」，只列出这次实验
   真正改了什么（不是拿 mini 和 desktop 直接比，那样会把历史差异全算进来）。
3. **确认后应用到主环境** - AI 逐条解释，用户点头才写；每步 `.bak`，随时回滚。

## Baseline, not the other profile

```bash
# 开始一次实验
node tools/promote.mjs --from <mini> --to <desktop> --snapshot

# ...在 mini 里随便改...

# 看这次实验产生了什么改动
node tools/promote.mjs --from <mini> --to <desktop>
```

实测：快照之后把 demo 挂件从 `top-left` 挪到 `bottom-right`，清单只有一行：

    改动清单（1 项）:
      ~ 位置       demo-anchor-widget  top-left → bottom-right

这就是「让 AI 读取改动」的原料：一份人可读、机器可解析的差异，而不是让 AI 去猜。

## What is automated and what is not

| 改动类型 | `--apply` 会不会自动做 | 原因 |
|---|---|---|
| 新增插件（bundle） | 会（复制包 + 写 bundle 列表） | 可逆，删掉即可 |
| 位置（anchor） | 不会，交回 `anchor.mjs` 逐条确认 | 位置是用户偏好，不该批量推 |
| 停用状态 | 不会，交回 `manage.mjs` | 同上 |

自动化只覆盖「装上/卸下」这种客观动作；带偏好的改动一律走人。

## Why the browser side matters

实验必须能在浏览器里做：mini 跑在 `127.0.0.1:<port>`，面板就是浏览器里的一个浮层。
所以拖动、预览、截图全在浏览器完成；主环境不需要任何浏览器端工具——它只接收结果。

这也解释了为什么拖动模式只在 mini 有意义：**它是实验台的操作方式，不是运维方式。**
