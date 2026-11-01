# 数据保护批次第一步：toggle 收敛为一份（2026-11-02）

深度打磨批次一的 1A 工作包：把四套 patch 切换实现收敛成一份，并用**先红后绿**证明 P0-1 已修。

## 先红：新回归在旧代码上确实失败

`tools/test-manage-roundtrip.mjs`（带 config 的行往返）：

```
FAIL disable 没有新增第二个 id 块
FAIL enable 字节级还原   "\n[]\n"        ← 用户 config 被删光，文件退化成 []
FAIL 重复 disable 不产生第二个块
MANAGE_ROUNDTRIP_FAILED 3
```

## 改了什么

| 位置 | 之前 | 现在 |
|---|---|---|
| `manage.mjs` 主写路径 | 追加新块 / 删整块 | `toggleText(patchText, id, disable)` |
| `manage.mjs` menu 路径 | 自带 `toggleInPatch` 替换块 | 同上一份实现 |
| `index.js` | 有未调用的 `toggleLegacy` | 删除 |
| dry-run 文案 | 「追加 / 删除整块」 | 「块内插入 / 删除 disabled，保留其它键」 |

空 `[]`、重复 disable、带 `config`/`name` 的行、字节级往返，都由同一份 `toggle-text.js` 保证。

## 后绿

```
ok   disable 保留用户 config
ok   disable 没有新增第二个 id 块
ok   enable 字节级还原
ok   重复 disable 不产生第二个块
ok   空 [] 也能 disable 且不再是 []
MANAGE_ROUNDTRIP_OK
```

## 回归

```
test:all              59 个套件 exit 0
e2e-panel-offline      42/42（menu 路径行为变化未破坏面板）
```

## 仍未做（批次一剩余）

- 写后读回 / 前置 hash 冲突 / 备份恢复的专项断言（已有 `safeWritePatch`，缺测试）；
- `tests/manage-fixture` 里累积的 `.bak-*` 残留清理；
- 隐私扫描扩到发布包（D-04）。
