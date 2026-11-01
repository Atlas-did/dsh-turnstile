# 图片预览修好了 + mini 实验场还能加什么

## 一、为什么之前「图片无法预览」

以前 `image` 组件只接受两种地址：`http(s)://…` 和 `/turnstile/…`。
**本地文件（你截图存在 state/ 或 docs/img/ 里的那些）根本没法被页面引用**——写上去就显示「只允许 http(s)」。

这不是同一类问题的重复，是**权限模型没设计**：图片要能进来，就得有一条受控的读取通道。

### 现在的写法

| 写法 | 用途 | 例子 |
|---|---|---|
| `https://…` | 外链图片 | CDN、图床 |
| `/turnstile/…` | 站内资源 | 面板自带的图 |
| **`asset:<绝对路径>`** | **本地文件**（白名单目录） | `asset:<home>/Desktop/mini-harness/state/page-with-image.png` |

新增路由 `GET /turnstile/asset?path=…`：

- 只允许三个根：`<repo>/docs/img`、`<repo>/state`、环境变量 `DSH_TURNSTILE_ASSETS` 指定的目录；
- 解析后必须仍在根内（挡 `../` 穿越）；
- 只放行图片扩展名（png/jpg/jpeg/webp/gif/svg），其它返回 415；
- 不在白名单 → 403 并回显允许的根目录（便于自查）。

实测：

```
docs/img/panel.png  → 200 image/png 143,600B
C:\Windows\win.ini   → 403 不在允许的图片目录里
页面里引用 asset:… → img naturalWidth 1440x900（真的渲染出来了）
```

截图：`state/page-with-image.png`（标题 + 图片 + 表格三段都在）。

## 二、mini 当实验场：还能加什么（我的提议）

按「离你的卖点近不近」排序，不是按技术难度。

### A. 实验场闭环（最贴合卖点）

| 提议 | 一句话 | 现在缺什么 |
|---|---|---|
| **`sandbox trial <plugin>`** | 在 mini 里装→跑一次真实健康检查→出报告→自动卸载 | 安装要手工 pnpm；没有「试完就还原」 |
| **`sandbox promote`** | mini 验证通过 → 生成「主 profile 要改哪 4 处」的清单 | 没有 diff 与生成 |
| **迷你 profile 快照** | 实验前拍一张，坏了 3 秒回滚 | `profile-snapshots` 只有 verified-bootable |
| **实验记录（journal）** | 每次实验：装了什么、结论、耗时；可导出成 issue | `lib/journal.js` 只记事务 |

### B. 页面搭建器继续长

| 提议 | 一句话 |
|---|---|
| 数据绑定 | 表格/图表直接从 `/turnstile/plugins`、`/turnstile/health` 取数，不用手写 |
| 页面转插件 | 一键把搭建好的页面导出成一个小插件（`dsh.bundle.patch` + client） |
| 更多图形 | 饼图、折线（带坐标轴）、漏斗 |
| 样式自由输入 | 颜色/字号/圆角的原始值，而不只是 4 个枚举 |
| 模板 | 预置「体检报告页」「插件占用页」两个模板 |

### C. 让 AI 更会用（这是你说的「只会只读模式」的根）

| 提议 | 一句话 |
|---|---|
| skill 里加「实验动作清单」 | 哪些操作必须在 mini 做、哪些绝不能碰主 profile，写成可执行清单 |
| `diagnose --fix-plan` | 不只给修法文本，给一份**可执行的步骤文件**（谁来做、做什么、怎么回滚） |
| 失败样本库 | 把今天 17 条反馈做成可回放的语料（已有 `tests/corpus`），加「新故障 → 存样本」命令 |

### D. 平台层面

| 提议 | 一句话 |
|---|---|
| 把 mini 平台上传仓库 | 现在工具在 GitHub、机器不在；别人 clone 完没沙盒（skill 第零步能建，但没打包） |
| 启动器自检 | START-MINI 启动前先跑 `new-sandbox --verify`，端口/目录/版本不对就先说话 |

## 三、我的建议顺序

1. **A 里的「实验记录 + promote」**：它把「mini 是实验场」这件事从口号变成流程；
2. **C 里的 skill 清单 + `--fix-plan`**：直接解决「下载的人只会只读」；
3. **B 里的数据绑定 + 页面转插件**：让搭建器从玩具变成产出物。
