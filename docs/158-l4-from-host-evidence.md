# L4 也能用真实宿主证据判定（2026-11-01）

上一轮的缺口：宿主证据只有 SHA-256，没有正文，L4（界面内容）永远是 unknown，claim 只能到 `routable`。

## 改动

| 文件 | 改动 |
|---|---|
| `lib/mini-host-adapter.mjs` | `fetchRoute` 额外返回 **`bodyExcerpt`**（真 HTTP 正文，压缩空白后截断 800 字） |
| `lib/host-collector.mjs` | 证据 `route.bodyExcerpt` 可选带上（校验器不强制） |
| `verify-live.mjs` | 没有活宿主连接时，**用证据摘录判 L4**：含 `--expect` → pass，不含 → fail |
| `acceptance-mini.mjs` | 复判时带 `--expect <name>` |

## 实测（mini 18770）

```
  ✓ host-observe-after       pass  ...\.acc-l4-host-evidence.json
  ✓ verify-with-host-evidence pass  verified / L2=pass：bootId 805020→281a6f 已重启
  ✓ uninstall                pass  bundles 32→31
  ✓ rollback-verified        pass  路由 404，dump-config 里 已无
```

claim 从 `routable` 升到 **`verified`**：真实宿主证据现在同时证明了
**重启后加载（L2）→ 路由可达（L3）→ 页面里真的有这个插件的名字（L4）**。

## 为什么还不是 verified-with-regression

L5（回归）需要装前装后对比；这条链路里没有采集 health/UI 面基线，所以 L5 仍是 unknown。
**不知道就说不知道**，不硬凑一个「全绿」。

## 测试

`test-evidence-unify` 新增 4 条：验收器复判带 `--expect`、采集器抓摘录、摘录截断 800 字、L4 可用摘录判定。

```
test:all     32 套件全绿
e2e-console  98/98
```

## 仍未做

- L5 回归基线（装前 health / UI 面快照）还没进 acceptance；
- 桌面端验收仍未做；
- 摘录是整页前 800 字，长页面里目标文本可能被截断——需要时再改成「关键词附近摘录」。
