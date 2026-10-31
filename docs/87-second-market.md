# 第二个插件市场装上了（以及为什么上次我用 pnpm 装不回来）

用户问：「之前不是有两个插件市场吗，另一个装了没有，我怎么没看到」。

答案是：**上次装了又卸了**（因为判断两个市场会抢侧栏，其实不会），这次按你的要求装回来了。

## 现在的状态

```
deps    32   （新增 @ace-zone/dsh-market@0.1.66）
bundles 37   （dshmarket 与 @ace-zone/dsh-market 并存）
文件     node_modules/@ace-zone/dsh-market/{src,cordis.patch.yml,...}
语法     src/host.js、src/client.js 均通过 node --check
依赖     marked 16.3.0 已在 profile 里，满足 ^16.0.0
```

## 为什么不能用 `pnpm add`

这个 profile 里有一个依赖是 `github:xsoc1/math-research-dsh`，pnpm 每次解析都要 `git fetch`；
当前代理连不上 github → 整条安装失败，哪怕只是加一个无关的包。

兜底办法（这次用的）：

```bash
npm pack <包名>@<版本> --pack-destination /tmp/x   # 只下载 tarball，不解析整棵依赖树
tar -xzf x/*.tgz -C /tmp/x
cp -r /tmp/x/package <profile>/node_modules/<包名>
# 然后手工写 package.json 的 dependencies + dsh.profile.bundles
```

**代价**：这种装法不进 pnpm 的 lockfile。下次有人跑 `pnpm install`，它可能被当成多余目录清掉。
要长期稳定，等代理恢复后用 `pnpm add` 重装一次。

## 生效

需要**重启 DSH**：插件在启动时装配，运行态不会热加载新的 bundle。
