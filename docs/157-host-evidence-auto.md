# 宿主证据自动采集（2026-11-01）

上一轮的遗留：`host-observe` 要人手工跑 before/after。现在 **`acceptance` 一条命令全自动**。

## 链路

```
acceptance <name> --mini <root>
  1. create                生成可加载插件
  2. host-observe before   记录重启前宿主（pid / bootId / 运行时身份）
  3. install+verify        试装并【重启】宿主（lab-reload），六级验证
  4. host-observe after    记录新启动（bootId 必须不同）+ 目标路由内容 SHA-256
  5. verify --host-evidence 用真实宿主证据再判一次 L2/L3
  6. uninstall             真删目录 + 移出 bundles
  7. rollback-verified     重启后路由 404 且 dump-config 里没有它
```

## 实测（mini 18770）

```
  ✓ create                 pass  ...\Temp\acc-h2
  ✓ host-observe-before    pass  ...\.acc-h2-observation.json
  ✓ install+verify         pass  verified-with-regression
  ✓ host-observe-after     pass  ...\.acc-h2-host-evidence.json
  ✓ verify-with-host-evidence pass  routable / L2=pass：host-evidence：bootId 2cb538→50e3b5 已重启
  ✓ uninstall              pass  bundles 32→31，node_modules/acc-h2 已删
  ✓ rollback-verified      pass  路由 404，dump-config 里 已无
```

注意 claim 是 **routable** 而不是 verified-with-regression：真实宿主证据证明了加载与路由，
但 L4（界面内容）还没有内容可比——证据里只有 SHA-256，没有正文。**这是诚实降级，不是失败。**

## 途中修的两个真 bug（都在别人的代码里）

1. **根路由判定太死**：`mini-host-adapter` 要求 `status === 200`，但真机根路由是 **303 跳转** → 采集一直失败。
   改成 `>= 400` 才算失败。
2. **`fetch` 会自动跟随 303**：跳到不带 token 的地址后变成 401，于是误报「token 无效」。
   加 `redirect: 'manual'`。

这两个只要真跑一次就暴露——这也说明「隔离夹具通过」不等于「真机可用」。

## L3 也可以由证据提供

没有活宿主连接时，`verify-live` 现在会用证据里的 `route{status,bodySha256,bodyBytes}` 判 L3。
判据仍是真 HTTP 得到的（由 host-observe 采集），不是编的。

## 测试

`test-evidence-unify` 新增 3 条：证据里的路由可判 L3、验收器自动 before/after、验收器用证据复判。

```
test:all     32 套件全绿
e2e-console  98/98
```

## 仍未做

- L4 需要证据里带**正文片段**（现在只有哈希），否则界面层永远是 unknown；
- 桌面端验收仍未做；
- `host-observe` 的 after 阶段依赖「已经有人重启过」，目前由 trial 的重启满足；若单独使用仍需人工重启。
