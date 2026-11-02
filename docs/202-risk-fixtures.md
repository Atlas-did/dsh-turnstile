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

- 控制台里 finding 还不能跳到文件：`locator.file` 已具备，UI 接 `vscode://file/...` 的改动还没做
  （`renderInspector` 是一整行大函数，改动需要小心，留到下一轮单独处理）；
- 规则级「基线差异」（新增/消失/仍存在）未做。
