# A/B/C/D 落地记录（第一轮：A 全部 + B 三项）

## A. mini 实验场闭环（17 条测试；真实宿主加载仍需单独验收）

| 工具 | 干什么 | 实跑证据 |
|---|---|---|
| `tools/sandbox-snapshot.mjs` | 实验前拍快照（package.json / cordis.patch.yml / compatibility.json），可 `--take` / `--list` / `--restore latest` | 拍完改坏 → 回滚 → 文件回到 `[]`，且留 `.before-restore-*` |
| `tools/lab-journal.mjs` | 实验记录（jsonl 追加，永不改写），可 `--list` / `--export issue.md` | 写入两条 → 列表 + 导出 markdown 表格 |
| `tools/sandbox-trial.mjs` | 一条命令走完：快照 → 装前检查 → 装 → 静态验证 → 记录 → **默认回滚**（`--keep` 保留） | `结论：静态通过；插件加载未验证`；依赖/node_modules 都被还原；`--keep` 时保留 |
| `tools/sandbox-promote.mjs` | 沙盒 → 主 profile：先列「要改哪几处」，`--apply` 才写（备份 + YAML 校验） | dry-run 列出 bundles/dependencies/patch 三处；`--apply` 后主 profile 通过 profile-yaml |

测试：`tools/test-sandbox-lab.mjs` —— **17 条全过**。

## B. 搭建器继续长（三项完成）

| 项 | 内容 | 验证 |
|---|---|---|
| **数据绑定** | 新组件 `dataTable` / `dataChart`，属性 `source = plugins/health/occupancy`；渲染时向宿主端点取数 | e2e：模板加载后 `[data-source=health]` 存在 |
| **导出为插件** | `tools/builder-export.mjs <page.json> <out>` 生成 `package.json` + `cordis.patch.yml` + `lib/index.js` + `lib/page.json` + README | `test-builder-export.mjs` 7 条：产物齐全、handler 真返回含页面文字的 HTML、坏输入非零退出 |
| **内置模板** | 左侧「模板」：体检报告页 / UI 占用页，一键套用 | e2e：套用后画布出现「环境体检」 |

## 还没做的（B 剩两项 + C 全部 + D 全部）

- B3 饼图 / 带坐标轴的折线
- B4 样式自由输入（颜色/字号原始值）
- C1 skill 实验动作清单、C2 `diagnose --fix-plan`、C3 新故障样本捕获
- D1 沙盒模板打包进仓库、D2 启动器自检
