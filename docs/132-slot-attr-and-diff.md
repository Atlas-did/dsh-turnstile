# 归属规则收拢成一份 + slot 时间对比（2026-11-01 夜间）

## 1. 两处实现合成一处

之前 `ui-atlas.mjs` 和 `slot-map-report.mjs` 各写一份归属规则，正是本项目批评的「手工漂移」。
现在唯一实现：`tools/lib/slot-attr.mjs`

```js
pluginOf('dsh-better-sidebar:editor')  // 'dsh-better-sidebar'
pluginOf('@s/p/guide')                 // '@s/p'
pluginOf('turnstile.plugin-list')      // 'turnstile'
pluginOf('bash')                       // null（核心）
```

两个工具都改成 import 它；`plugins/turnstile-popup/test/slot-attr.test.mjs` 16 条覆盖。

## 2. `--against`：装插件前后，位置变了什么

```bash
node tools/slot-map-report.mjs --map after.json --against before.json
```

输出：

```
slot 变化 · before.json  →  after.json
  shell.overlay  (1 → 2)
    + dsh-new:toast
```

**这补上了「装前装后」在运行时这一侧的空白**：
`profile-snapshot --diff` 回答「插件集合和配置变了什么」，
`slot-map-report --against` 回答「实际插进去的条目变了什么」。两个一起看才完整。

## 3. 一个测试自己抓到的错

我最初断言「没有变化的 slot 不出现」，但测试数据里 `s2` 是**整个消失的 slot**——
那当然算变化（removed）。断言写错了，改成：「整块消失记为移除」+「真正没变化才不出现」两条。

## 4. 测试

```
slot-attr.test.mjs        16 条（四种前缀 / 分组 / 三种 diff 形状 / CLI）
test-slot-map-report.mjs   8 条
test-look-tools.mjs       24 条（含穿越与双份实现一致）
e2e-console-offline     89/89
```
