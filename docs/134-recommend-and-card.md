# 推荐插件目录 + genui 卡片（2026-11-01）

## 为什么要有「推荐」这层

好插件不少，但**装完不接入 = 没装**。所以本项目的推荐不是「名单」，而是三件事：

1. 它是什么（一句话）
2. **装完怎么接进本项目**（具体命令/落点）
3. 本机装没装（没装就明说，装了给版本）

## `tools/recommend.mjs`

```bash
node tools/recommend.mjs <profile>          # 人读
node tools/recommend.mjs <profile> --json   # 给程序读
node tools/recommend.mjs --only genui       # 看一个
```

实测（desktop profile）：

```
dsh-genui  [已装 0.3.1]
  是什么：生成式交互界面：在会话里渲染图表/表单/测验等交互组件（读 schemaJson 代码块）
  怎么接：tools/card.mjs → 把体检/占用结论变成可点的 genui 卡片

Aegis  [未装]
  是什么：架构一致性守护：记录既有设计边界，检测后续提交是否偏离初衷
  怎么接：作为 preflight 的可选检查：装了就并入总闸门，没装就跳过并说明
  注意：本机没装也没读源码，接入方式是基于公开描述的推断（未验证）
```

## 目录里现在有 5 个

| 插件 | 本机状态 | 接入点 |
|---|---|---|
| dsh-genui | **已装 0.3.1**（实测 inject 4 面、lib 里确实读 schemaJson） | `tools/card.mjs` |
| Aegis | 未装（unverified） | preflight 可选检查 |
| superdesign-skill | 未装（unverified） | 给 console.html / builder.html 做质感审查 |
| distilly | 未装（unverified） | 接在 lab-journal 之后 |
| brooks-lint | 未装（unverified） | preflight 可选检查 |

**纪律**：`status: installed` 必须带 `verified` 证据（版本号 + 在哪看到的）；没装没读源码的一律 `unverified`，并明说「接入方式是推断」。

## `tools/card.mjs`：让结论变成可点卡片

```bash
node tools/card.mjs --kind slots --from state/slot-map-mini.json
node tools/card.mjs --kind health --from state/report-desktop.json
```

输出一个 ```schemaJson 代码块，贴进对话 genui 就渲染成表格卡片（检查项 / 状态 / 说明）。

实测（slot-map 105 个 slot）：

```
```schemaJson
{"componentName":"Page","children":[{"componentName":"TinyCard","children":[...TinyGrid...]}]}
```
```

没装 genui 也能用（就是一段 JSON），但价值在渲染。

## 测试

`tools/test-recommend-card.mjs` 12 条：目录结构纪律（每条必须有接入方式 / installed 必须有证据）、`--only` 过滤、无 profile 也能跑、卡片围栏与结构、缺文件报错。

## 仍未做

- 那 4 个 unverified 插件**没在本机验证过**：接入点是按公开描述设计的，真正的验证要装上跑一次。
- 还没有「自动推荐」：现在是手动 `recommend`；要做成「clone 后首次运行自动提示」，得接进 setup 流程（尚未实现）。
