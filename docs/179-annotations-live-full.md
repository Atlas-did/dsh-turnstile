# 批注功能真机全流程（2026-11-01 第 2 轮）

上一轮只验了「新建 + 持久化 + 导出」。这轮在**真实 mini（18770）**把剩下六项交互全跑了一遍。

## 真机结果：10/10

```
ok   Ctrl+Shift+A 打开侧栏
ok   Esc 关闭侧栏
ok   选中文字出现批注入口
ok   保留原文摘录   像杀毒软件那样扫一遍：凭据
ok   保存后出现卡片   1
ok   定位未抛错且侧栏仍可控
ok   标为已解决的卡片有 resolved 样式
ok   重新打开后不再是 resolved
ok   删除需要二次确认
ok   确认后卡片消失
MINI_ANNOT_OK · errors: none
```

## 窄屏（390×760）

```
toggle visible narrow: true
drawer box: {x:0,y:0,width:390,height:760}   # 全屏面板
nav still clickable: true                    # 批注入口没有挤掉导航
```

截图：`state/shots/mini-annotations-full.png`、`mini-annotations-narrow.png`。

## 一个操作前提（写下来免得再踩）

**选区批注按钮在侧栏打开时是隐藏的**——必须先 `Esc` 关掉侧栏再选文字，
否则点击会超时（我第一次就这么失败的）。

## 回归

```
test:all                  exit 0，52 个套件
e2e-console-offline       103/103
e2e-annotations-offline    19/19
```

## 仍未验证

- 桌面端（非 mini）的同款体验
- 多设备同步（设计上没有，界面已标注）
- 批注内容的语义质量（是否真的能帮后续对话定位问题）——这需要人用过才知道
