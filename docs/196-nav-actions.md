# 定位框的动作组（方案 01-A 收尾，2026-11-02）

## 动作从哪里来

`tools/console-data.mjs` 从**统一命令注册表**派生，不另抄一份：

```js
const actions = Object.entries(ACTION_LABELS)
  .filter(([id]) => COMMANDS[id])
  .map(([id, [label, view]]) => ({ id, label, view, mutating: Boolean(COMMANDS[id].mutating) }));
```

8 个动作：体检 / 门禁 / UI 占用 / 槽位 / 上次试装 / 停用 / 启用 / 拍快照。

## 界面行为（关键约束）

- 写操作在结果里显式标注「写操作（只出计划）」；
- 点击动作**只导航到相关视图**并提示「只生成计划，定位框不写入」；
- 真正的 apply 仍然只能走 CLI/面板的确认流。

## e2e（113/113，新增 3 条）

```
PASS  写操作出现在动作组
PASS  动作标注只出计划
PASS  点击动作只提示不写入
```

## 验证

```
test:all   62 个套件 exit 0
```

## 仍未做

- 动作没有绑定参数（例如「停用某插件」需要选对象后才能出计划）；
- 01-C 列表状态条（筛选后/总数、四种空态）与 01-D 页面级提示条未做。
