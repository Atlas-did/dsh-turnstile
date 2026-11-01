# 文档分层：索引 + 历史分离（2026-11-01，P5 第一步）

问题：148 篇文档平铺，新用户不知道从哪读；而且早期文档写着「尚未实现」，后来实现了也没标。

## 做法（不重命名，避免破坏已有引用）

| 文件 | 角色 |
|---|---|
| `docs/README.md` | **当前**索引：按「你现在要做什么」分类，39 篇 |
| `docs/history.md` | **历史**实施记录，自动生成，明确写「不代表当前行为」 |

`tools/docs-index.mjs` 生成历史清单：

```bash
node tools/docs-index.mjs          # 重新生成
node tools/docs-index.mjs --check  # 过期就 exit 1（进 test:all）
```

## 新规则（能自动守住的）

`tools/test-docs-links.mjs`：

1. `README.md` / `INSTALL.md` / `docs/README.md` 里的**相对链接必须存在**（本次检查 50 条，0 失效）
2. **没有孤儿文档**——每篇 `.md` 要么在当前索引、要么在 `history.md`
3. `history.md` 不能是过期快照（新加文档没重新生成就会红）

## 实测

```
ok   入口文档相对链接都能解析   （50 条）
ok   没有孤儿文档（索引或历史里必须出现）
ok   history.md 不是过期快照
DOCS_LINKS_OK
```

当前状态：**39 篇在索引里 / 108 篇归入历史** / 0 篇孤儿。

## 仍未做

- 没做物理分目录（`guide/ reference/ architecture/ status/ evidence/`）——那会破坏大量已有链接，需要单独的迁移轮；
- 索引里每篇还没写「预期结果 / 失败怎么办 / 如何回滚」；
- 教程里的命令还没做冒烟测试（现在只验链接存在）。
