# 26 · 多接口（provider）地图与切换

生成器：`node tools/providers.mjs <profile>`（需 `DSH_HOME`；桌面用 junction `deskmirror`）。

## 当前桌面实际路由（2026-10-29 实测）

| 路由 | 来源 | 模型数 | baseURL |
|---|---|---|---|
| `deepseek-official (live)` | 账号登录（deepseek-account） | 2（API 实时列） | https://api.deepseek.com |
| `llm-deepseek` | 手写 patch 行 | 13 | https://opencode.ai/zen/go/v1 |
| `llm-pi-ai:opencode-go-chat` | pi-ai 子 provider | 16 | https://opencode.ai/zen/go/v1 |
| `llm-pi-ai:opencode-go-responses` | pi-ai 子 provider | 3 | https://opencode.ai/zen/go/v1 |
| `llm-pi-ai:cmd-openai` | pi-ai 子 provider | 3 | https://api.commandcode.ai/provider/v1 |
| `llm-pi-ai:moonshotai-cn` | pi-ai 内置 | 0（内置目录） | 官方 |

## 踩过的坑：同一个模型 id 挂在两条路由上

2026-10-29 报错：

```
dsh: INVALID_REQUEST: The supported API model names are deepseek-flash, deepseek-v4-pro,
but you passed deepseek-v4.1-flash.
```

原因不是模型不存在，而是 `agent-default-model` 写的是
`provider: deepseek-official` + `model: deepseek-v4.1-flash`——
**v4.1-flash 只存在于 opencode 那条路由，却挂到了官方 API 上**。

修复：
1. `agent-default-model` 改成 `deepseek-official / deepseek-flash`（官方确实支持）。
2. 从 `llm-deepseek` 行删掉与官方重名的 `deepseek-v4-pro`、`deepseek-flash`（15 → 13 个）。
   → `tools/providers.mjs` 复测：跨路由重名 0。

## 切换方式（三种，按需要选）

| 场景 | 做法 |
|---|---|
| 临时换一次 | 界面模型选择器直接选（按 provider 分组） |
| 改默认 | patch 里 `agent-default-model` 的 provider + model 两行一起改 |
| 整套换套餐 | 改 `llm-pi-ai.providers` 下对应子 provider 的 `models` 或 `apiKeyEnv` |

## 不变量（改完必须复测）

1. `node tools/providers.mjs deskmirror` → 「跨路由重名」必须是 0。
2. `agent-default-model` 的 model 必须属于所选 provider。
3. 改完跑 `node tools/preflight.mjs`（五项阻塞）。
