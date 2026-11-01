# 145 · 对话主入口、证据解释与写入闸门

## 目标

普通用户不需要记命令，也不需要先打开面板。用户对 DSH 智能体说「看看插件状态」「制作一个页面」，
智能体通过 `ask` 得到结构化动作，再按只读、界面或写入三种类型处理。

本轮改动仅在隔离副本与临时夹具中验收，没有同步或修改真实 mini、主仓库和桌面 profile。

## 对话动作契约

```text
用户原话
  → node tools/turnstile.mjs ask <profile> "<原话>" --json
  → { intent, actions[], missing? }
```

- 只读动作：`doctor`、`trial-status`、`preinstall` 等，通过统一命令注册表执行。
- 界面动作：`open-builder` 返回 `/turnstile/builder`；它是页面地址，不是 shell 命令。
- 写入动作：`anchor`、`fix`、`manage-enable`、`manage-disable` 等，只生成计划。
- `ask --apply` 不再直接执行写操作，更不能通过旧 `manage.mjs --yes` 绕过统一令牌。

## 写入纪律

1. 对同一命令和参数先 `--dry-run`，取得一次性 `applyToken`。
2. 向用户展示计划、影响面与回滚方式，等待明确确认。
3. 用 `--apply --token <token>` 重放；token 绑定命令和参数且不能复用。
4. 高危 `manage-disable` 还要求 `--confirm <包名>` 与目标逐字一致。CLI 与 `/turnstile/run` 都执行这条规则。

`anchor` 和 `fix` 已加入命令注册表。临时夹具验证两者的 dry-run 都签发计划令牌，且目标文件逐字节不变。

## 试装证据解释

`trial-status` 读取最近一次 `kind:"trial"` journal：

| 记录 | 对外结论 | 退出码 |
|---|---|---:|
| 无有效记录 | 还没有试装证据 | 3 |
| `static-pass` | 仅静态通过；真实宿主插件加载未验证 | 2 |
| `fail` / `blocked` | 最近一次试装未通过，并显示原因 | 1 |
| 其他记录 | 警告，要求核对真实宿主加载证据 | 2 |

损坏 JSONL 行和非 trial 记录不会充当试装证据。统一报告现在保留底层的人话 `summary`、
结构化 `evidence` 与 `next`，避免只剩 `warn` 或丢失「重启真实宿主并检查目标路由」的提示。

## 已验证

- `test:ask`：30 项，覆盖意图、结构化动作、builder URL 与写操作拒绝直接 apply。
- `test:trial-status`：12 项，覆盖无记录、损坏行、static-pass、fail、blocked、最近记录和注册表调用。
- `test:report`：包含人话总结、底层证据和下一步保留。
- `test:run-route`：面板路由两段式写入、高危 confirm、token 一次性与参数绑定。
- `test:cli-token`：CLI 无 token 拒绝、高危 confirm、token 一次性与参数绑定、anchor/fix 空跑不写文件。
- `test:skill-pack`：更新后的对话优先技能文档仍满足打包检查。

## 尚未完成

真实 mini 的试装、重启与目标路由验收仍未在本轮执行。`static-pass` 和 HTTP health 都不是这项证据。
下一阶段是真实宿主试装适配与加载证据，而不是把现有隔离结果改名为「真实试装成功」。
