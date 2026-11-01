# 多选原子删除与多选复制粘贴（2026-11-01）

handoff P1 的编辑闭环：多选删除以前是明确拒绝的，复制只接受单选。现在都支持，且**一次操作只产生一个历史步骤**。

## 数据层（`page-model.js`）

| 命令 | 语义 |
|---|---|
| `removeMany` | 先全部校验（全部存在、非根），再一次性删除；祖先与后代同时选中时只删祖先，不重复删 |
| `pasteMany` | 按顺序插入多个节点，全部换新 id；空剪贴板明确报错 |

两者都是纯函数（不改传入页面），失败时整体不生效——不会留下半改状态。

## 界面层（`builder.html`）

- 剪贴板从单个节点改成**有序数组**
- 复制支持多选：按画布顺序取，父节点已选时排除其后代
- 粘贴、删除都调用新命令，历史标签是「粘贴 N 个节点」「删除 N 个节点」

## 实测

模型层（`test-page-batch` 9 条）：

```
ok  批量删除清空子节点
ok  批量删除不改原页面（纯函数）
ok  任一目标不存在则整批失败
ok  根节点不能删
ok  祖先与后代同选时只删祖先
ok  批量粘贴插入两个节点
ok  粘贴得到新 id
ok  粘贴保留顺序
ok  空剪贴板明确报错
```

浏览器（`e2e-builder-offline`）：

```
ok  two nodes selected before delete
ok  multi-node delete removes all selected in one step
ok  undo restores both deleted nodes in one step   canvas=4
BUILDER_E2E_OK
```

## 途中修的两处

1. `labelOf` 没有 `removeMany` / `pasteMany` 分支 → 历史标签会显示原始命令名，已补。
2. 复制后的状态文案还引用旧的单节点变量 `node` → 浏览器报 `node is not defined`，改成数量。

## 测试

```
test:all           35 套件全绿
e2e-builder        BUILDER_E2E_OK
e2e-builder-console BUILDER_CONSOLE_E2E_OK
```

## 仍未做

- 多选**结构化移动**（Alt+方向键仍是单选）；
- 跨父级粘贴时的目标推断仍按「选中容器或其父」，没有更聪明的落点选择；
- 桌面端验收。
