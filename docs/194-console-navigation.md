# 控制台定位框（方案 01-A/B 第一步，2026-11-02）

## 落地内容

| 项 | 状态 |
|---|---|
| `console-navigation.js` 纯函数模块（索引 / 搜索分组 / hash 编解码 / 敏感检查） | ✅ |
| 页面 `Ctrl/Cmd+K` 定位框（输入、分组结果、Esc 关闭、点结果导航） | ✅ |
| 导航时写 `#view=...`（**只放视图**，不含 token/路径/正文） | ✅ |
| 宿主与独立控制台都提供该静态文件 + 同步白名单 | ✅ |

## 测试

```
test-console-navigation   18 条纯函数断言
e2e-console-offline      108/108（新增 Ctrl+K、输入、Esc）
test:all                  62 个套件 exit 0
```

## 途中修的两个真问题

1. 浏览器里 `const text` 与页面已有全局同名 → 改名为 `navText`。**这类冲突只在真实浏览器里报，Node 测试抓不到。**
2. `renderNav` 读的是 `res.objects`，实际结构是 `res.groups.objects` → 打开就抛 `Cannot read properties of undefined`。是 e2e 的 uncaught error 断言抓到的。

## 明确没做

- 结果项里**没有动作组**（actions 传空数组）：动作需要绑定命令注册表与 mutating 标记，留到接 `CommandDescriptor` 时一起做；
- hash 目前只写 `view`，`kind/id` 的恢复还没接（对象已不存在时如何提示也未接）；
- 列表状态条（01-C）与页面级提示条（01-D）未动。

## 下一步

- 把 `kind/id` 写进 hash 并在加载时恢复选中对象；对象消失时给「该对象已变化」提示；
- 接入动作组（只到 dry-run，不直接写）。
