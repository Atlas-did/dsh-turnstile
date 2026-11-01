# 复审 P1-6 / P1-5 / P2-1 / P2-2 处置（2026-11-01）

## P1-6：CI 没跑完整 test:all ✅

`.github/workflows/selftest.yml` 新增两步：

```yaml
- name: full test suite
  run: npm run test:all --silent

- name: tests must not modify the worktree
  run: |
    if [ -n "$(git status --porcelain)" ]; then
      echo '测试改动了工作区：'; git status --porcelain; git diff --stat; exit 1;
    fi
```

第二条直接对治「文档冒烟写出 `#` 文件」那类污染：以后测试只要改仓库，CI 就红。

## P1-5：恒真断言 ✅

`test-move-many.mjs` 里 `ok('批量移动是一次命令（一个历史步）', true)` 换成真的命令栈：

```
ok  批量移动是一次命令（一个历史步）   0 → 1
ok  撤销一步复原整个批量移动          ABC
```

## P2-1：页面校验不查属性声明 ✅

`page-validate.js` 现在对每个节点做两类检查：

- `props` 逐项对照 `COMPONENTS[type].propsSchema`：未知属性、枚举外、超范围都报
- `style` 逐项对照 `STYLE_SCHEMA`：未知样式项、超范围都报

```
ok  非法枚举属性被拒   400
ok  超范围样式被拒
ok  未知属性被拒
```

## P2-2：moveMany 不查 draggable ✅

批量移动现在和单节点 `move` 用同一条能力检查，不可拖拽的组件会被明确拒绝。

## 验证

```
test:all  exit 0，47 个 _OK
跑完 test:all 后 `git status` 只剩我自己的改动（没有测试污染）
```

## 仍未做

| 项 | 状态 |
|---|---|
| P1-3 验收无 try/finally、可能删已有目标 | ❌ |
| P2-3 `fuse --apply` 逐条写非原子 | ❌ |
| 其他多路由的请求体上限未统一（目前只统一了 /turnstile/run） | ❌ |
