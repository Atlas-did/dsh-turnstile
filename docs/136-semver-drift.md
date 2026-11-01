# semver 两套实现：不合并，先证明不矛盾（2026-11-01）

## 现状

| 实现 | 位置 | 语义 |
|---|---|---|
| 宿主判定器 | `tools/version.mjs`（`checkCompatibility`） | 兼容 / 不兼容 / **null=不知道** |
| 手写规则 | `tools/registry.mjs`（`satisfies`） | OK / SKIPPED / UNCERTIFIED / UNDECLARED / MISSING / EXEMPTED |

registry 的六种状态比 version 的两值丰富（EXEMPTED、UNCERTIFIED 在 version 里没有对应物）。
**强行合并会改变 registry 的输出语义**，那属于另一件事，不是顺手能做的。

## 这一轮做的：漂移测试

`plugins/turnstile-popup/test/semver-drift.test.mjs`：

1. 跑 `registry.mjs <profile>`（用 spawnSync，因为 registry 用退出码表达「有非 OK 项」）；
2. 对每个 OK / SKIPPED 的插件，调 `checkCompatibility(manifest)`；
3. **断言两者结论一致**：registry 说 OK ↔ version 说不兼容是 0 个。

实测（desktop，32 行状态表）：

```
ok   registry 输出了状态表   32 行
ok   至少比较了一个插件   8
ok   两套 semver 判断不矛盾
SEMVER_DRIFT_TEST_OK (8 个插件一致)
```

带 `DSH_VERSION=0.2.1-rc.3` 再跑一次：同样 8 个一致（此时 version 走宿主判定器而不是 semver 兜底）。

## 为什么不直接合并

- registry 的 `EXEMPTED`（显式豁免）和 `UNCERTIFIED`（dsh.compatibility 排除了当前版本）**没有 version 对应语义**；
- 合并会把「豁免」降级成「OK」或把「未认证」升格成「OK」，都是**结论变弱**；
- 漂移测试能立刻发现两者分歧，代价小得多。

## 仍未做

- `occupancy.mjs` / `doctor.mjs` 改用 `lib/ui-scan.mjs`（ui-surfaces 已改）；
- 把漂移测试接进 CI 的默认集（现在要手动跑或用 `node --test`）。
