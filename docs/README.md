# 文档索引

这里按「你现在要做什么」分类。编号只用于定位，不代表阅读顺序；历史文档保留当时结论，不能替代当前证据边界。

## 第一次使用

| 文档 | 什么时候读 |
|---|---|
| [项目 README](../README.md) | 对话、控制台、统一 CLI 三条入口 |
| [安装与卸载](../INSTALL.md) | 环境要求、安装、写入纪律、隐私 |
| [对话入口](145-conversation-entry.md) | 自然语言动作、结构化计划与确认 |
| [页面创作闭环](116-abcd-complete.md) | 搭建、保存、预览、导出与隔离验证 |

## 试装与证据

| 文档 | 回答的问题 |
|---|---|
| [宿主证据与采集](146-host-evidence-contract.md) | 如何证明新启动的真实宿主加载了插件 |
| [实验场与搭建器](115-lab-and-builder-v3.md) | 快照、试装、回滚和导出如何衔接 |
| [运行时验收](67-runtime-acceptance.md) | 为什么静态通过不等于运行时通过 |
| [桌面模式状态](121-desktop-mode-status.md) | 桌面端证据与未覆盖范围 |
| [安全修复记录](129-security-fixes-from-review.md) | 已发现的安全问题和修复 |

## 日常使用与故障排查

| 文档 | 症状或目标 |
|---|---|
| [预检闸门](21-preflight-gate.md) | 哪些检查阻断，哪些只是建议 |
| [插件 UI 面地图](122-ui-plugin-atlas.md) | 谁注入了哪个界面区域 |
| [Gate Map](30-gate-map.md) | 覆盖关系、拓扑与历史 |
| [槽位分布](131-slot-distribution.md) | 每插件 × 每 slot 的运行时分布 |
| [运行时记录结构](130-runtime-records-shape.md) | slot-map 的字段与解释 |
| [FAQ](faq/README.md) | 安装、认证、版本和桥接问题 |

## 控制台、视觉与交互

| 文档 | 内容 |
|---|---|
| [控制台信息架构](39-console-ia.md) | 页面与导航为什么这样分组 |
| [控制台数据契约](36-console-data-contract.md) | 数据源和界面边界 |
| [模拟点击验收](37-mock-click-e2e.md) | 如何验证按钮与真实输入 |
| [虚拟列表](77-virtual-list-wired.md) | 大列表渲染机制 |
| [属性 schema](74-field-schema.md) | 属性检查器如何由声明生成 |

## 扩展与机制研究

| 文档 | 内容 |
|---|---|
| [能力模型](70-capabilities.md) | 可扩展能力声明 |
| [Hook 规则](80-hook-rules.md) | 扩展点与约束 |
| [上游项目入门](111-upstream-projects-primer.md) | 参考项目与适用范围 |
| [借用机制](141-borrowed-mechanisms.md) | 从成熟软件借鉴的机制，而非复制许可证不明代码 |
| [架构图](50-modules.md) | 模块划分与依赖 |
| [入口与发布验收](147-release-and-onboarding.md) | 文档入口、自动发布检查和证据边界 |
| [检查器扩展契约](148-check-extension.md) | 不改核心代码，接入显式声明的第三方检查器 |
| [统一命令解析](149-command-registry.md) | CLI、JSON 和面板路由共享参数与写入约束 |
| [页面编辑历史](150-builder-history.md) | 任意步骤回退、撤销／重做同步与分支规则 |
| [页面多选与批量编辑](151-builder-multi-select.md) | 共同属性、混合值、原子命令与整体撤销 |
| [页面大纲与键盘操作](152-builder-outline-keyboard.md) | 层级导航、选择同步、快捷键与输入框保护 |

## 历史记录（需要时再看）

- [实施日志](97-implementation-log.md)：阶段性实施证据。
- [CI 修复](103-ci-green.md)：连续失败暴露的真实问题。
- [外部评审](104-external-review.md)：当时的评审结论，后续状态以当前代码和测试为准。
- [最终报告](108-final-report.md)：历史节点报告，不代表当前所有能力均已在真实环境验收。
- [诚实缺口评审](109-honest-gap-review.md)：已知限制与证据纪律。

| [真机验收](159-l5-baseline.md) | 装→六级→卸→回滚，一次跑完并落证据 |
| [宿主证据自动采集](157-host-evidence-auto.md) | before/after + bootId + 路由内容 |
| [页面版本与并发写](160-page-version.md) | 两个标签页不会互相覆盖 |
| [页面树校验](161-page-tree-validation.md) | 坏页面进不来 |
| [多选编辑](162-multi-select-edit.md) | 多选删除/复制粘贴，一次一步 |
| [设计令牌](164-design-tokens.md) | 两个界面共用一套颜色/间距 |
