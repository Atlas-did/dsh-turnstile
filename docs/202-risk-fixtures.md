# 风险规则的正负夹具成对（2026-11-02）

方案 03 要求「每条规则至少一个正夹具、一个负夹具」——否则规则只会报警，无法证明它能放过正确写法。

## 新增负夹具

```text
tests/risk-fixture-clean/
  package.json                     dependencies: plug-ok
  node_modules/plug-ok/package.json   dependencies: @deepseek-ai/schemastery
  node_modules/plug-ok/index.js       import ... from '@deepseek-ai/schemastery'
```

同一规则（peer-only / undeclared official scope）在这个夹具上必须**静默**：

```
ok   负夹具：声明了官方 scope 的插件不报警   []
```

正夹具（`tests/risk-fixture`，插件 import 了没有声明的官方 scope）仍然报 `risk.peer-only-scope`。

## 验证

```
test-risk-findings  9 条（新增 1 条负夹具断言）
```

## 仍未做

- 规则级「基线差异」已有 CLI（`--baseline` / `--save-baseline`），控制台的展示已接（检查页风险区块）；
- 控制台还不能自己触发一次扫描并落盘（现在靠 CLI 跑 `--save`），按钮留到下一轮。
