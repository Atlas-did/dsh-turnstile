# AA 连不上：根因是版本不匹配（2.0.2 插件 × 2.1.0 桌面端）

用户反复看到「DSH 启动中 · 正在等待本地 DSH Bridge」。这一轮把两边日志都读了，定位到**协议层**。

## 证据链

1. **端口是活的**：`127.0.0.1:59040 LISTENING`，pid 是 DSH 进程；AA 也真的连上了（`TIME_WAIT`）。
   所以「文件不存在 / 没启动」这种判断是错的。
2. **插件日志（`~/.agents-anywhere/dsh-bridge-next/logs/dsh-runtime.jsonl`）**：

```
bridge.connected   -> 收到连接
rpc.failed  method=invalid  errorCode=PARSE_ERROR   ×5
bridge.socket_error ERR_STREAM_WRITE_AFTER_END
bridge.disconnected initialized=false
```

`PARSE_ERROR` 的意思很直接：**AA 发来的字节，插件按 JSON-RPC 2.0 行协议解析失败**。
3. **版本**：

```
AA 桌面端     Agents Anywhere.exe  FileVersion 2.1.0
DSH 插件      @agents-anywhere/dsh-bridge-next 2.0.2
npm 上的版本   2.0.0 / 2.0.1 / 2.0.2 / 2.1.0（latest=2.1.0）
```

**插件落后一个版本，而 2.1.0 桌面端用的正是 meshcall（v2）协议。** 这就是 PARSE_ERROR。

## 已做的修复

```
@agents-anywhere/dsh-bridge-next  2.0.2 -> 2.1.0
新增依赖 meshcall@0.3.0（2.1.0 才需要）
meshcall 的依赖 ajv@8.20.0 / ajv-formats@3.0.1 一并补进 profile
package.json: deps 32 / bundles 36
两个入口文件 node --check 通过
```

装法仍是 `npm pack` + 解包（pnpm 在这个 profile 里被 `github:xsoc1/math-research-dsh` 的 git fetch 卡住）。

## 需要重启

插件在启动时装配，**必须完全退出 DSH 再开**。重启后应看到：

1. `bridge.connected` 之后不再出现 `PARSE_ERROR`
2. AA 里 DSH 从「启动中」变「运行中」
3. 侧栏「远程控制」文字恢复了（2.1.0 是干净文件，我的收字补丁只打在 2.0.2 上，随版本升级自然消失）

## 仍未验证

重启后的实际连接结果我没法自己确认（需要真实交互）。如果重启后**仍然** PARSE_ERROR，就说明桌面端 2.1.0
期望的插件更新版本还没发布，只能等作者，或者反过来把桌面端降到 2.0.2 对应版本。
