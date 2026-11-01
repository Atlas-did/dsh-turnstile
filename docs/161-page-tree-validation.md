# 页面树严格校验与 schema 迁移（2026-11-01）

handoff P0 最后一处：恢复页面时只查 `schema` 和 `root`，坏树照样进渲染器。现在有了严格校验。

## 新模块 `plugins/turnstile-popup/lib/page-validate.js`

| 检查 | 说明 |
|---|---|
| schema | 必须是 `mini/page@1`；更旧版本明确拒绝并说明当前版本 |
| root | 必须存在且类型是 `stack` |
| 节点 id | 必须是非空字符串且**全局唯一** |
| 组件类型 | 必须在 `COMPONENTS` 注册表里 |
| props / children | props 是对象，children 是数组 |
| 结构 | 不接受子节点的组件（heading/text）带了 children 要报 |
| 上限 | 节点数 ≤ 2000，层级 ≤ 32 |

`migratePage()` 是迁移入口：当前只认 `@1`；将来加 `@2` 时在这里升级，未知版本一律拒绝（不猜）。

## 接线

| 位置 | 行为 |
|---|---|
| `console-server` 的 `POST /turnstile/page` | 校验不过 → **400 + errors[]**，不落盘 |
| 插件的 `POST /turnstile/page` | 同上（同一份实现，不重复写） |

## 实测（真起 console-server，走真 HTTP）

```
ok   好页面可以保存
ok   重复 id 被拒 400
ok   未知组件类型被拒
ok   根不是 stack 被拒
ok   旧 schema 明确拒绝并说明
ok   缺 schema 被拒
PAGE_TREE_OK
```

## 途中修的一个自己的 bug

第一版 `checkNode` 内部递归子节点，而外层 walk 也递归 → **同一个节点被检查两遍**，
导致合法页面被判「id 重复」。改成「checkNode 只检查自己，递归交给调用方」。

## 测试

```
test-page-tree   6 条（真 HTTP）
test:all         34 套件全绿
e2e-builder      BUILDER_E2E_OK
e2e-builder-console BUILDER_CONSOLE_E2E_OK
```

## 仍未做

- props 的逐项类型/范围校验仍由 `applyCommand` 负责，这里只查结构；
- 没有真正的 `@2` 迁移（等有需求时再写，不预造）；
- 桌面端验收仍未做。
