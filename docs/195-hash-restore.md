# URL 定位恢复与「对象已变化」提示（2026-11-02）

方案 01-B 的第二步：`kind/id` 进 hash、加载时恢复、对象消失时明确提示。

## 行为

| 场景 | 行为 |
|---|---|
| 打开 `#view=plugins&kind=plugin&id=dsh-free-search` | 恢复到插件视图并选中该插件 |
| 打开 `#…&id=no-such-plugin-xyz` | 提示「该对象已变化或不在本次数据中：…」，**不**自动选相邻对象 |
| 切换视图 / 选中对象 | 回写 hash（只含 view/kind/id，无 token、无路径、无正文） |

## e2e（110/110，新增 2 条）

```
PASS  hash 恢复视图与选中对象
PASS  对象不存在时明确提示而不是乱选
```

## 途中发现的真问题（只会在浏览器里出现）

页面里有一个 `id="history"` 的节点，**它会遮蔽 `window.history`**，
导致 `history.replaceState is not a function`。必须显式写 `window.history.replaceState`。

这类 DOM 全局属性遮蔽在 Node 测试里完全看不到，是 e2e 抓到的。

## 未做

- 打开/后退恢复滚动位置与排序（现在只恢复视图与对象）；
- 动作组仍为空（actions 传 []）；
