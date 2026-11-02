# 历史实施记录

> 这些文档是当时的过程记录，**不代表当前行为**。当前状态请看 [文档索引](README.md)。
> 本文件由 `node tools/docs-index.mjs` 生成，新增文档请重新生成。

| 文档 | 当时的标题 |
|---|---|
| [100-actions-in-panel.md](100-actions-in-panel.md) | 修法进面板，且每条必须带回滚点 |
| [101-preinstall-gate.md](101-preinstall-gate.md) | 装之前先看现状（preinstall） |
| [102-no-proxy-effective.md](102-no-proxy-effective.md) | 「写进 NO_PROXY」不等于「已经生效」 |
| [105-review-round2.md](105-review-round2.md) | 外部反馈第 2 轮：17 条，修复记录 |
| [106-review-round3.md](106-review-round3.md) | 第 3 轮：Windows 脚手架与 CLI 契约（B2/B3/B9/B10） |
| [107-b1-b17-tracker.md](107-b1-b17-tracker.md) | B1–B17 处理对照表（交给反馈者复测） |
| [110-mechanism-inventory.md](110-mechanism-inventory.md) | 机制清单：从哪些项目里抽了什么（供你继续加） |
| [112-page-builder.md](112-page-builder.md) | mini 页面搭建器（这次真的从零做了一个） |
| [113-builder-v2.md](113-builder-v2.md) | 搭建器 v2：能渲染进宿主 + 表格/图表 + 样式面板 |
| [114-assets-and-ideas.md](114-assets-and-ideas.md) | 图片预览修好了 + mini 实验场还能加什么 |
| [117-aa-incident-summary.md](117-aa-incident-summary.md) | AA 连不上：两个故障叠在一起（协议版本 → 出站代理） |
| [117-incremental-flatten.md](117-incremental-flatten.md) | 增量扁平索引：展开/折叠不再重走全树 |
| [118-windows-integration-kit.md](118-windows-integration-kit.md) | 想做「深度集成」的插件，还缺什么器材 |
| [119-windows-recipes.md](119-windows-recipes.md) | Windows 深集成菜谱（一条一个真实场景，都在本机跑过） |
| [120-launcher-hotkey-windows-api.md](120-launcher-hotkey-windows-api.md) | 启动器 / 全局热键 / ctx.windows（第一轮） |
| [123-look-tools.md](123-look-tools.md) | 三个「看」的工具（补上研究 UI 插件缺的入口） |
| [124-look-in-console.md](124-look-in-console.md) | 「看」进控制台 + 运行时列（2026-11-01） |
| [125-runtime-slot-report.md](125-runtime-slot-report.md) | 运行时上报：端到端跑通的链路 + 一个诚实的 0（2026-11-01） |
| [126-mini-compat-declaration.md](126-mini-compat-declaration.md) | 插件兼容 mini 的声明规范 |
| [127-control-mini-from-main.md](127-control-mini-from-main.md) | 从主环境直接控制 mini（三种入口） |
| [128-snapshot-ask-fix.md](128-snapshot-ask-fix.md) | 补上三个设计缺口：对比 / 一句话 / 修复闭环 |
| [132-slot-attr-and-diff.md](132-slot-attr-and-diff.md) | 归属规则收拢成一份 + slot 时间对比（2026-11-01 夜间） |
| [133-external-review-verdict.md](133-external-review-verdict.md) | 外部调研的四份文档：哪些对、哪些不对（2026-11-01 复核） |
| [134-recommend-and-card.md](134-recommend-and-card.md) | 推荐插件目录 + genui 卡片（2026-11-01） |
| [135-entry-and-dedup.md](135-entry-and-dedup.md) | 单一入口 + UI 扫描收敛（2026-11-01） |
| [136-semver-drift.md](136-semver-drift.md) | semver 两套实现：不合并，先证明不矛盾（2026-11-01） |
| [137-doctor-gatemap-migration.md](137-doctor-gatemap-migration.md) | doctor / gate-map 也迁到 lib/ui-scan（2026-11-01 收尾） |
| [138-run-route-p0.md](138-run-route-p0.md) | `/turnstile/run`（02 设计 §4 的 P0）+ 三个收尾（2026-11-01） |
| [139-panel-tiers-and-next.md](139-panel-tiers-and-next.md) | 面板两档 + `next[]` 契约 + 高危确认（2026-11-01） |
| [140-plugin-verification.md](140-plugin-verification.md) | 五个推荐插件的实地核验（2026-11-01） |
| [142-doc-same-head-already-fixed.md](142-doc-same-head-already-fixed.md) | 这份文档 = HEAD 0831190 的同一份（2026-11-01 复核） |
| [143-agent-entry-steps.md](143-agent-entry-steps.md) | 让对话入口真正可用（《下一步行动指南》落地，2026-11-01） |
| [144-write-plan-json.md](144-write-plan-json.md) | 写操作的 dry-run 现在给结构化计划（2026-11-01） |
| [145-contract-content.md](145-contract-content.md) | 契约层「有壳没内容」的修复（2026-11-01 实测反馈） |
| [146-evidence-levels.md](146-evidence-levels.md) | P1.0/P1.1：验证分级 + 真机验证（2026-11-01） |
| [147-trial-wired-to-evidence.md](147-trial-wired-to-evidence.md) | 试装接上六级验证（P1.1 收尾，2026-11-01） |
| [148-create-loop.md](148-create-loop.md) | 创作闭环第一段：新建 → 试装 → 六级验证（2026-11-01） |
| [149-one-command-loop.md](149-one-command-loop.md) | 一条命令跑完创作闭环（2026-11-01） |
| [150-create-command.md](150-create-command.md) | `turnstile create`：创作闭环一条命令（2026-11-01） |
| [153-merge-kimi.md](153-merge-kimi.md) | 合并 kimi 分支（2026-11-01） |
| [155-handoff-first-round.md](155-handoff-first-round.md) | 按 handoff 做的第一轮（2026-11-01） |
| [156-evidence-unified.md](156-evidence-unified.md) | 证据词统一（2026-11-01） |
| [158-l4-from-host-evidence.md](158-l4-from-host-evidence.md) | L4 也能用真实宿主证据判定（2026-11-01） |
| [163-multi-move.md](163-multi-move.md) | 多选结构化移动（2026-11-01） |
| [165-builder-responsive.md](165-builder-responsive.md) | 搭建器响应式与窄屏抽屉（2026-11-01） |
| [166-console-responsive.md](166-console-responsive.md) | 控制台窄屏抽屉（2026-11-01） |
| [167-privacy-security.md](167-privacy-security.md) | 隐私与安全审查的处置（2026-11-01） |
| [168-docs-layering.md](168-docs-layering.md) | 文档分层：索引 + 历史分离（2026-11-01，P5 第一步） |
| [169-docs-smoke.md](169-docs-smoke.md) | 文档命令冒烟测试（2026-11-01） |
| [170-audit-p0-fixes.md](170-audit-p0-fixes.md) | 代码质量审查的 P0 处置（2026-11-01） |
| [171-audit-p1-fixes.md](171-audit-p1-fixes.md) | 审查 P1-1 / P1-2 处置（2026-11-01） |
| [172-reaudit-fixes.md](172-reaudit-fixes.md) | 复审三个新问题的处置（2026-11-01） |
| [173-reaudit-ci-and-validation.md](173-reaudit-ci-and-validation.md) | 复审 P1-6 / P1-5 / P2-1 / P2-2 处置（2026-11-01） |
| [174-acceptance-transaction-and-hash-version.md](174-acceptance-transaction-and-hash-version.md) | 复审 P1-3 处置 + 版本号改成内容哈希（2026-11-01） |
| [175-health-and-transactions.md](175-health-and-transactions.md) | 主仓库复核后的收口（2026-11-01 第 2 轮） |
| [176-body-limits-and-protocol.md](176-body-limits-and-protocol.md) | 剩余四项的收口（2026-11-01 第 3 轮） |
| [177-compat-and-visual.md](177-compat-and-visual.md) | 兼容矩阵与视觉证据（2026-11-01 第 4 轮） |
| [178-annotations-live.md](178-annotations-live.md) | 侧边栏批注：真机验证（2026-11-01） |
| [179-annotations-live-full.md](179-annotations-live-full.md) | 批注功能真机全流程（2026-11-01 第 2 轮） |
| [180-annotation-first-batch.md](180-annotation-first-batch.md) | 批注层最小改造：第一批四项（2026-11-02） |
| [181-health-issues.md](181-health-issues.md) | 方案 02-A：诊断 issue 归一化（2026-11-02） |
| [182-steward-issue-groups.md](182-steward-issue-groups.md) | 方案 02-B/C：管家三组 + 四段式详情（2026-11-02） |
| [183-issue-recheck.md](183-issue-recheck.md) | 方案 02-D：复检闭环 + 同步覆盖改成传递闭包（2026-11-02） |
| [184-doctor-issue-parity.md](184-doctor-issue-parity.md) | CLI 与 UI 同源：doctor 输出同一份 issue（2026-11-02） |
| [185-finding-issues.md](185-finding-issues.md) | doctor findings 也归一化成 issue（2026-11-02） |
| [186-provision-batch-schema.md](186-provision-batch-schema.md) | Provision 批次：两层适配卡最小 schema（2026-11-02） |
| [187-toggle-unify.md](187-toggle-unify.md) | 数据保护批次第一步：toggle 收敛为一份（2026-11-02） |
| [188-write-hardening.md](188-write-hardening.md) | 批次一收尾：写路径加固、备份残留清理、隐私扫描扩围（2026-11-02） |
| [189-manage-expect.md](189-manage-expect.md) | 计划指纹接进 manage（2026-11-02） |
| [190-provision-v1.md](190-provision-v1.md) | Provision 第一版：只读探测 + 两层卡 + stale（2026-11-02） |
| [191-knowledge-three-states.md](191-knowledge-three-states.md) | 知识三态：current / stale / absent（2026-11-02） |
| [192-provision-adoption.md](192-provision-adoption.md) | Provision 采纳流：计划 → token → apply（2026-11-02） |
| [193-provision-in-snapshot.md](193-provision-in-snapshot.md) | 适配卡进快照 + 写后自动复探（2026-11-02） |
| [194-console-navigation.md](194-console-navigation.md) | 控制台定位框（方案 01-A/B 第一步，2026-11-02） |
| [195-hash-restore.md](195-hash-restore.md) | URL 定位恢复与「对象已变化」提示（2026-11-02） |
| [196-nav-actions.md](196-nav-actions.md) | 定位框的动作组（方案 01-A 收尾，2026-11-02） |
| [197-list-status.md](197-list-status.md) | 列表状态条（方案 01-C 第一步，2026-11-02） |
| [198-banner-and-status.md](198-banner-and-status.md) | 状态条扩到 checks/surfaces + 页面级提示条（01-C/01-D，2026-11-02） |
| [199-banner-per-view.md](199-banner-per-view.md) | 提示条按视图分化（01-D 收尾，2026-11-02） |
| [200-scroll-restore.md](200-scroll-restore.md) | 视图切换恢复滚动位置（01-B 收尾，2026-11-02） |
| [201-risk-findings.md](201-risk-findings.md) | 风险 finding 标准化（方案 03-A 第一步，2026-11-02） |
| [202-risk-fixtures.md](202-risk-fixtures.md) | 风险规则的正负夹具成对（2026-11-02） |
| [22-gate-report.md](22-gate-report.md) | 闸门报告（自动生成） |
| [26-provider-map.md](26-provider-map.md) | 26 · 多接口（provider）地图与切换 |
| [31-plugin-manager.md](31-plugin-manager.md) | 31 · mini 的插件管理界面：现状与两条路 |
| [32-runtime-probe.md](32-runtime-probe.md) | turnstile-probe (host plugin) |
| [33-no-live-slot-tree.md](33-no-live-slot-tree.md) | Why there is no live slot tree |
| [34-proposal-global-slots-snapshot.md](34-proposal-global-slots-snapshot.md) | Proposal: a global slots snapshot API for DSH |
| [35-kimi-review-response.md](35-kimi-review-response.md) | Response to the Kimi review (2026-10-30) |
| [38-report-v2-implementation-plan.md](38-report-v2-implementation-plan.md) | report.json v2: implementation plan (field by field) |
| [40-probe-isolation-measured.md](40-probe-isolation-measured.md) | probe isolation: what actually works (measured, Node v25.8.0) |
| [41-turnstilerc.md](41-turnstilerc.md) | .turnstilerc: one place for the numbers (design) |
| [42-fixture-skeletons.md](42-fixture-skeletons.md) | Fixture skeletons laid down before the code (research phase) |
| [43-manage-mini-mode.md](43-manage-mini-mode.md) | 管理 mini 模式（可直接粘贴给 agent 的提示块） |
| [44-fusion-modes.md](44-fusion-modes.md) | Fusion mode: what A can do, and when only B is left |
| [45-agent-screenshots.md](45-agent-screenshots.md) | Screenshots for the agent (so "move it to the top-left" can be checked) |
| [46-mini-lab-preset.md](46-mini-lab-preset.md) | Mini 实验场预设：现状与卡点（2026-10-30） |
| [47-lab-to-main.md](47-lab-to-main.md) | Lab -> main: the promote pipeline (no dragging in the live environment) |
| [48-element-inspection.md](48-element-inspection.md) | Element inspection: what the DOM can and cannot tell us |
| [49-walkthrough.md](49-walkthrough.md) | Walkthrough: install an experiment, move it, promote it |
| [51-tool-ui-patterns.md](51-tool-ui-patterns.md) | What professional system tools teach about this panel |
| [52-five-tools.md](52-five-tools.md) | Five tools, function by function, and what we take |
| [53-oss-references.md](53-oss-references.md) | Open-source references we actually picked |
| [54-virtual-screen.md](54-virtual-screen.md) | Capturing without taking over the screen |
| [55-self-play-notes.md](55-self-play-notes.md) | Self-play session, 2026-10-30 22:40 |
| [56-designers-study.md](56-designers-study.md) | wxFormBuilder and Pygubu Designer: now studied from the real UI |
| [57-store-compliance.md](57-store-compliance.md) | DSH STORE findings, and what was changed |
| [58-windows-oss-sources.md](58-windows-oss-sources.md) | Windows open-source sources: what was actually read |
| [59-cpSync-crash.md](59-cpSync-crash.md) | A reproducible Node crash: `fs.cpSync` out of `node_modules` |
| [60-real-mini-acceptance.md](60-real-mini-acceptance.md) | Acceptance on the real mini profile (2026-10-31) |
| [61-view-state.md](61-view-state.md) | View state: remembering the table, with a fail-closed parser |
| [62-sort-context.md](62-sort-context.md) | Sort context: reproducible order, not a remembered column |
| [63-property-sheet.md](63-property-sheet.md) | Property sheet: properties and actions separated (model done, page wiring pendin |
| [64-diff-state.md](64-diff-state.md) | Diff view: orthogonal bitfields (from WinMerge) |
| [65-virtual-window.md](65-virtual-window.md) | Virtual list: only the visible rows exist (from TreeNew) |
| [66-command-stack.md](66-command-stack.md) | Command stack: what wxFormBuilder does, and why we kept snapshots |
| [68-ui-runtime-acceptance.md](68-ui-runtime-acceptance.md) | UI-level runtime acceptance: a disabled plugin actually disappears |
| [69-sync-live.md](69-sync-live.md) | Keeping the running copy honest: `tools/sync-live.mjs` |
| [71-multi-select.md](71-multi-select.md) | Multi-select: a selection is data (P0-3, first slice) |
| [72-batch-write.md](72-batch-write.md) | Batch write: one preview over many plugins |
| [73-history-timeline-panel.md](73-history-timeline-panel.md) | History timeline as a parallel panel (P0-1, done the safe way) |
| [75-hooks.md](75-hooks.md) | Event hooks: before may refuse and must say why (P0-5) |
| [76-store-audit-2026-10-31.md](76-store-audit-2026-10-31.md) | Store readiness audit, 2026-10-31 (fresh run, not a re-statement) |
| [78-declared-properties.md](78-declared-properties.md) | The properties pane is now declared, not drawn |
| [79-controls-from-schema.md](79-controls-from-schema.md) | Declarations now decide the controls too (P0-4 complete) |
| [81-e2e-product-acceptance.md](81-e2e-product-acceptance.md) | End-to-end product acceptance on the real mini profile |
| [82-video-triage.md](82-video-triage.md) | 一个 B 站视频里的三个 DSH 故障，对着我们的工具逐条查 |
| [83-tutorial-pitfalls.md](83-tutorial-pitfalls.md) | 新手教程里的坑，对着我们的工具查了一遍 |
| [84-physical-exam.md](84-physical-exam.md) | 全面体检（杀毒软件式的一键扫） |
| [85-steward.md](85-steward.md) | 环境管家：左体检，右全部 profile |
| [86-sidebar-actions.md](86-sidebar-actions.md) | 侧栏底部两个按钮：一个变大，一个收成图标 |
| [87-second-market.md](87-second-market.md) | 第二个插件市场装上了（以及为什么上次我用 pnpm 装不回来） |
| [88-aa-protocol-mismatch.md](88-aa-protocol-mismatch.md) | AA 连不上：根因是版本不匹配（2.0.2 插件 × 2.1.0 桌面端） |
| [89-day-retro-2026-10-31.md](89-day-retro-2026-10-31.md) | 2026-10-31 全天复盘（写给醒来后的你） |
| [90-plan-draft.md](90-plan-draft.md) | 计划初稿：DSH 环境治理体系（2026-10-31 夜） |
| [91-grill-questions.md](91-grill-questions.md) | grill-me 盘问清单（等用户回答；每题带我的推荐答案） |
| [92-review-round1.md](92-review-round1.md) | 计划审核 · 第 1 轮（子 agent 独立审核，2026-10-31 夜） |
| [93-plan-v2.md](93-plan-v2.md) | 计划 v2（吸收第 1 轮审核，待用户拍板） |
| [94-sds-draft.md](94-sds-draft.md) | SDS 草稿 v0：DSH 环境诊断（diagnose） |
| [95-sds-v1.md](95-sds-v1.md) | SDS v1（吸收 SDS 审核，仍待用户确认作用域决策） |
| [96-decisions-approved.md](96-decisions-approved.md) | 决策记录：2026-10-31 深夜「按推荐」全部通过 |
| [98-research-github.md](98-research-github.md) | GitHub 相关项目调研（2026-10-31 夜） |
| [99-last-known-good.md](99-last-known-good.md) | 「上次可用」比「当前」更需要被看见 |
