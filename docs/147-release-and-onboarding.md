# 147 · 入口文档与发布验收

## 目标

让第一次接触项目的人能从同一份入口理解三条路径：普通用户对话、可选可视化控制台、高级用户统一 CLI。
同时让发布检查自动抓住失效文档链接、不存在的工具、写入闸门绕过示例和发布包缺文件，而不是靠人工记得检查。

本轮只修改隔离副本，所有验收均在本仓库、自包含临时夹具或最小隔离模块宿主中完成；没有同步或修改真实 mini、主仓库和桌面 profile。

## 入口分工

- `README.md`：中文主入口，说明对话、控制台、统一 CLI、证据边界和完整验证命令。
- `README.en.md`：英文入口，保留详细机制背景，同时采用统一写入计划与令牌流程。
- `INSTALL.md`：安装、对话技能、可选面板、两阶段宿主观察、写入纪律和隐私边界。
- `docs/README.md`：按使用任务分类，历史笔记不再与当前操作指南混在一起。
- `skills/turnstile/SKILL.md`：DSH 智能体的对话入口和动作约束。

文档中的界面动作与 shell 命令明确区分：`open-builder` 打开 `/turnstile/builder`，不是终端命令。

## 自动发布检查

```bash
# 入口、命令注册表、脚本、bin 和文档引用
npm run release:check

# 额外执行 npm pack --dry-run 并核对关键文件确实进入发布包
node tools/release-check.mjs --pack --json

# 正例与反例回归
npm run test:release
```

`test:release` 有 9 项断言，覆盖当前仓库、五个入口文档、完整命令注册表、当前平台 dry-run 打包、非空发布文件清单，以及四类必须被抓住的反例：失效链接、不存在的工具、`manage.mjs --yes` 和旧快照直接写入。

Windows 下不能直接 `spawnSync('npm.cmd')`。检查器通过系统命令解释器执行固定的 `npm pack --dry-run --json` 参数，不启用拼接参数的 shell 模式；该路径有真实打包回归，避免只在 Unix 上可用。

## 本轮实证

- `node tools/release-check.mjs --pack --json`：通过，发布包 506 个文件，关键文件缺失为零。
- `npm run test:all`：通过，已包含发布一致性测试。
- `npm run test:sandbox-lab`：通过，覆盖快照、试装、回滚和推送夹具。
- `npm run test:export`：17 项通过，覆盖导出、内容转义和最小隔离宿主首次／再次加载。
- `npm run test:builder:console`：8 项通过，覆盖保存、刷新恢复、导出、预览和浏览器脚本错误检查。

以上数字是本轮执行时的结果；后续新增本说明文件会改变发布包文件数，应以最新命令输出为准。

## 仍未覆盖

没有进行真实 mini 或桌面端的端到端试装验收。隔离模块加载、静态通过、HTTP health 和真实宿主加载仍是不同证据；发布检查通过也不改变这条边界。
