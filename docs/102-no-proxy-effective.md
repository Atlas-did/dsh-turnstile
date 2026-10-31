# 「写进 NO_PROXY」不等于「已经生效」

今天你手动修好 AA 的那一步，有几个容易被忽略的层次：

| 层 | 今天实测 | 含义 |
|---|---|---|
| 用户环境变量（HKCU\\Environment） | 含 `agents-anywhere.com` ✅ | 持久化，重启后仍在 |
| 当前进程 env | **不含**（只有 localhost 那串） | 这个进程是在写入之前启动的，读不到 |
| AA 进程 | 用户重启后读到了 | 所以它好了 |

**结论：持久化 ≠ 生效。** 一个已经在跑的 Electron 进程不会重新读环境变量。

## 新增判定

`tools/lib/proxy.mjs`：

```js
parseNoProxy(value)   // 逗号/分号/空格混合
covers(entries, host) // 精确、前导点、通配（172.16.* 支持跨段）
checkNoProxy({ host, userValue, processValue })
```

三态输出：

| 状态 | 输出 |
|---|---|
| 进程里有 | pass |
| **只在用户变量里** | warn「已写入但当前进程没读到」+ 下一步「完全退出重启」 |
| 两边都没有 | warn + 具体 `setx` 命令 |

## 在你机器上的实跑

```
$ node tools/diagnose.mjs --live
NO_PROXY  warn  web.agents-anywhere.com 已写入用户环境变量，但当前进程没有读到（Electron 只在启动时读）
         → 完全退出并重启该进程（AA / DSH）后才会生效
```

这条**准确描述了你现在的状态**：AA 已经好了（它重启过），而这个 DSH 会话没有（它没重启）。

## 测试

`tools/test-proxy.mjs` 6 checks（解析、后缀、通配、三态）+ `test-diagnose` 新增一条 live 集成（10 checks）。

## 未做

- 不写注册表（写操作要用户确认；工具只判）。
- 不判断「代理本身是否可用」——那是 `--probe` 的事，两者分开。
