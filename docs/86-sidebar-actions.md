# 侧栏底部两个按钮：一个变大，一个收成图标

用户看到的这一行：`Mimir`（很小）在左，`📱 远程控制`（占位大）在右。两个都是插件注入到同一个槽位
`sidebar.footer.action` 的动作：

| 插件 | 注册 | order | 体积来源 |
|---|---|---|---|
| dsh-mimir | `id: research` | 10 | 自己的 CSS module（`.jOeIUG_toggle`） |
| AA bridge | `id: agents-anywhere-next` | 26 | **没有自定义 CSS**，由宿主槽位样式决定 |

这就是为什么两者看起来不对称：一个自带 28px 胶囊样式，另一个吃宿主的默认行高。

## 做了什么（方案 A：改 client，留备份）

`tools/patch-sidebar.mjs`：

```
- mimir: height 28px -> 34px, font-size 13px -> 15px, padding 0 8px -> 0 14px, radius 14px -> 17px
- AA    : label: () => t("远程控制")  ->  label: () => ""      (只留图标)
```

两个文件都留了 `.bak-sidebar`：

```
dsh-mimir/lib/client.js.bak-sidebar
@agents-anywhere/dsh-bridge-next/lib/client.js.bak-sidebar
```

改完两个文件仍能过 `node --check`（不是靠肉眼）。

## 代价与恢复

- **插件升级会覆盖补丁**——升级后重跑 `node tools/patch-sidebar.mjs` 即可；
- 想还原：`node tools/patch-sidebar.mjs --revert`；
- 生效需要**重启 DSH**（客户端 bundle 在启动时加载）。

## 没验证的部分

改的是 **CSS 字符串**和**标签文本**，我没有能力在运行时截图确认像素效果（DSH 窗口截图看不到侧栏最底部）。
所以这一条标：**改动已落盘、语法通过、待重启后目视确认**。
