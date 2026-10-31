# 沙盒模板（platform/）

这个目录回答一个问题：**clone 下来之后，怎么在这台机器上有一个能开、能试、坏了不疼的 DSH 环境。**

工具在仓库根目录的 `tools/`；这里只放「怎么把工具用成一间实验场」的最小说明。

## 三条命令

```bash
# 1. 生成沙盒（独立 DSH_HOME / profile / 端口）
node tools/new-sandbox.mjs --root <目录> --profiles mini --port 18770 \
     --dsh-bin <DSH 的 lib/bin.js 路径>

# 2. 启动前自检（端口 / bundles / DSH 入口）
node tools/sandbox-verify.mjs --root <目录> --port 18770

# 3. 启动（Windows 双击 START-MINI.cmd，或直接）
DSH_HOME=<目录>/home node <bin.js> mini --no-open --port 18770
```

**必须满足**：`dsh.profile.bundles` 不能为空，至少 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`；
否则宿主没有 web surface，会**静默退出、日志 0 字节**（`new-sandbox` 已默认带上）。

## 造好之后的标准动作

```bash
node tools/preinstall.mjs <mini> <pkg>              # 装前看会不会撞车
node tools/sandbox-snapshot.mjs <mini> --take        # 动手前拍快照
node tools/sandbox-trial.mjs <mini> <pluginDir>      # 装+验+自动回滚
node tools/sandbox-promote.mjs <mini> <main>         # 出主 profile 变更清单
node tools/lab-journal.mjs --list                    # 看实验记录
```

## 目录约定

```
<root>/home/profiles/<name>/   profile（package.json + cordis.patch.yml）
<root>/state/                  报告、占用、页面、快照、实验记录
<root>/logs/                   启动日志（token 在里面）
<root>/runtime/                DSH 运行时（可选，也可以指到别处）
```

## 为什么不在仓库里塞一个完整沙盒

- 沙盒里有 `node_modules`（几百 MB）、日志、凭据——不该进 git；
- 沙盒的价值是「一条命令能再造一个」，不是一个特定产物。
