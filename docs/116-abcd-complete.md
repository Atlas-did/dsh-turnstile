# A/B/C/D 全部落地（收尾）

| 项 | 交付 | 验证 |
|---|---|---|
| A1 trial | `tools/sandbox-trial.mjs` | test-sandbox-lab 17 条；快照失败停止，结论分静态通过与加载未验证 |
| A2 promote | `tools/sandbox-promote.mjs` | 同上（dry-run / apply / YAML 校验） |
| A3 快照 | `tools/sandbox-snapshot.mjs` | 同上（拍 / 列 / 回滚 / .before-restore） |
| A4 记录 | `tools/lab-journal.mjs` | 同上（写 / 列 / 导出 markdown） |
| B1 数据绑定 | `dataTable` / `dataChart`（source=plugins/health/occupancy） | builder e2e：`[data-source=health]` |
| B2 导出插件 | `tools/builder-export.mjs` | test-builder-export 7 条（handler 真返回 HTML） |
| B3 更多图形 | 饼图（SVG 扇区 + 图例）、折线（带坐标轴） | builder e2e：`svg path` ≥3、`svg polyline` ≥1 |
| B4 样式自由值 | 颜色（#rrggbb）、字号（0–40）、圆角（0–24） | builder e2e：computed color = rgb(255,0,0)；单测：字号越界被拒 |
| B5 模板 | 体检报告页 / UI 占用页 | builder e2e：套用后出现「环境体检」 |
| C1 skill 清单 | `skills/mini-lab/SKILL.md` 新增「实验动作清单」 | 文档 |
| C2 fix-plan | `diagnose --fix-plan <file>` | test-cases-and-verify：步骤含做什么/回滚/验证 |
| C3 样本捕获 | `tools/capture-case.mjs` | 同上：冻结 → diagnose 能回放 |
| D1 沙盒模板 | `platform/README.md` + `platform/bootstrap.ps1` | 实跑 bootstrap → 生成 + 自检通过 |
| D2 启动自检 | `tools/sandbox-verify.mjs` | 3 种状态：非沙盒拒绝 / 合格可启动 / 空 bundles 不能启动 |

## 测试总量（本轮新增）

```
test-sandbox-lab            17
test-builder-export         17
test-cases-and-verify       10
page-model 单测             24
builder e2e                 24
```

## 已知限制

- trial 的 HTTP 健康检查需要 `--port` 且沙盒在跑；它只证明宿主响应，不证明目标插件已加载。
- trial 当前只给出静态通过与回滚证据；真实宿主重启和插件路由证据仍需单独验收。
- 数据绑定是「渲染时拉取」，没有缓存与轮询。
- 导出的插件与搭建器共用 page-render，并有独立隔离模块自检；这不等于真实 mini 试装。
