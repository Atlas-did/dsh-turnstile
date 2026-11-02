# 视图切换恢复滚动位置（01-B 收尾，2026-11-02）

## 行为

切换到别的视图前记住 `#main` 的 scrollTop，切回来时在下一帧恢复。

```js
const scrollMem = {};
function setView(view){ scrollMem[state.view] = $('main').scrollTop; ... render();
  requestAnimationFrame(() => { $('main').scrollTop = scrollMem[view] || 0; }); }
```

排序本来就由 view-state 持久化（`sortKey/sortDir`），这次没动。

## e2e（121/121，新增 1 条）

```
PASS  切回视图恢复滚动位置   {"beforeScroll":94,"afterScroll":94}
```

## 途中两个测试口径问题

1. 在 1440×960 下 `#main` 不溢出（页面整体滚动），scrollTop 恒为 0 → 测试改用 1024×600 才真的可滚动。
2. 断言要求 `>100`，但浏览器把 220 夹到最大 94 → 阈值改成 `>40` 并保持相等判断。

## 明确边界

- 滚动记忆**只在当前会话**内有效；刷新后仍只恢复视图与对象（不恢复滚动）。
- 每视图独立排序未做（现在排序是全局一个）。

## 验证

```
test:all   62 个套件 exit 0
```

## 01 模块状态

A 定位框 + 动作组 ✅ / B 可恢复定位（视图+对象+滚动）✅ / C 列表状态条 ✅ / D 按视图提示条 ✅
