# 打不开 / Web authentication failed

**症状**：DSH 启动后弹「认证失败」，点重启没用，退出再开还是一样。

**原因**：每次启动换一个端口，登录记录和服务端口绑定（默认保留 30 天），越攒越多；到某个量级就超限。

**修法**：

```
node tools/auth-records.mjs          # 看有多少条（超过 60 会报警）
node tools/auth-records.mjs --prune  # 删除，先自动备份 Cookies 到 .bak-<时间戳>
```

然后重启 DSH。账号不会掉，删的是**过期的端口记录**，不是登录态本身。

**本机现状**（2026-10-31 实测）：mini 侧能读，桌面侧 cookie 库被运行中的 DSH 锁住，工具会如实报
`locked` 而不是假装 0 条。真要修的时候 DSH 是打不开的状态、进程已退，那时就能读。
