# 试装接上六级验证（P1.1 收尾，2026-11-01）

「试装通过」现在有了准确定义：**六级证据里连续通过的最高层**，而不是文件层检查全绿。

## 改动

`tools/sandbox-trial.mjs` 第 4 步不再自判，改为调用 `verify-live.mjs --json`：

- 透传 `--dsh-bin` / `--base` / `--token` / `--routes` / `--expect` / `--surfaces-before`
- 支持 `--restart-cmd`（装完先重启，再做 L2 及之后的验证）
- 打印六层结果；没有 levelReport 时明确说「本次不能声称真实可用」
- 结论用 claim（static-only / loaded / verified / …），删掉了旧的「结论：通过」

## 真机实测：一个真实插件的完整六级（mini 18770）

```
  L0 pass  bundles 29 / deps 29 ; trial-probe 在 bundles 与 deps 里
  L1 pass  node_modules/trial-probe 存在 ; entry: lib/index.js
  L2 pass  dump-config 命中：# == trial-probe
  L3 pass  /probe → 200
  L4 pass  /probe 含 probe-ok
  L5 pass  credentials=pass bundles=pass ; UI 面回归：无插件消失
verdict ok | verified-with-regression
```

## 两次真实的失败（这就是分级的意义）

| 现象 | 六级怎么报 |
|---|---|
| 插件只有 main，没有 dsh.bundle | 宿主报 declares no dsh.bundle；L2 fail，claim=failed |
| bundle patch 用顶层 `- id:` 加行 | 宿主报 patch entry not found；L2 fail |

没有分级时，这两种情况都会显示「文件写了、yaml 解析了 → 通过」。正确写法是 `- insert:` 包一层（见 docs/46）。

## L5 现在也看 UI 面回归

`--surfaces-before <json>` 会与装后对比：装前存在的插件在装后消失 → L5 fail，并点名「面 ← 插件」。

## 测试

```
test-trial-wiring  9 条：调用 verify-live / 参数透传 / 六层输出 / 无结论时不许说可用 / 旧措辞已删
test:all          19 套件全绿 · e2e-console 89/89
```

## 仍未做

- `--restart-cmd` 之后 token 会变，目前需要自己重取；
- L4 仍是文本包含，没有截图/DOM 结构断言；
- trial 的 --json 只在最后输出一份，不含每层 evidence 全量。
