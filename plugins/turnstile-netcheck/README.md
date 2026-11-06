# turnstile-netcheck

一个只读的 DSH 网络诊断插件，打开 `/turnstile/netcheck` 后固定检查：

- `github.com/Atlas-did/dsh-turnstile` 仓库页；
- Git smart HTTP 的 `info/refs`；
- `opencode.ai`；
- `api.deepseek.com`。

检查使用 Node 原生 HTTPS 直连，不读取或修改系统代理、Git 配置、Clash、dev-sidecar 或任何 token。它只能证明直连路径，不代表代理路径可用。
