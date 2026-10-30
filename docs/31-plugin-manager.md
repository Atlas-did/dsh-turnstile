
## 第五版：属性面板（2026-10-30 13:35）

点一行不再直接切换，而是展开属性面板（`state/popup-props.png`）：

```
dsh-context
行 id: dsh-context
状态: 已停用
UI 面: ui-conversation, ui-settings, ui-sidebar-right
[启用] [收起]
```

面板固定在卡片顶部（`order: -1`），不用滚到底部；开关按钮在面板里，
避免误点整行就改配置。数据仍来自 host 路由 `/turnstile/plugins`。
