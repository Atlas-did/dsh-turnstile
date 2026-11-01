# 闸门报告（自动生成）

> 由 `node tools/report.mjs <profileDir>` 生成，不要手改。
> profile: `/nonexistent/profiles/desktop`
> 生成时间: 2026-10-31T12:44:42.940Z

## 1. 版本矩阵

```
node:fs:436
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^

Error: ENOENT: no such file or directory, open 'C:\nonexistent\profiles\desktop\package.json'
    at readFileSync (node:fs:436:20)
    at file:///<home>/Desktop/mini-harness/oss/dsh-turnstile/tools/registry.mjs:12:24
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
    at async node:internal/modules/esm/loader:639:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  errno: -4058,
  code: 'ENOENT',
  syscall: 'open',
  path: 'C:\\nonexistent\\profiles\\desktop\\package.json'
}

Node.js v25.8.0
```

## 2. 冲突面

```
node:fs:436
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^

Error: ENOENT: no such file or directory, open 'C:\nonexistent\profiles\desktop\package.json'
    at readFileSync (node:fs:436:20)
    at file:///<home>/Desktop/mini-harness/oss/dsh-turnstile/tools/conflict.mjs:15:24 {
  errno: -4058,
  code: 'ENOENT',
  syscall: 'open',
  path: 'C:\\nonexistent\\profiles\\desktop\\package.json'
}

Node.js v25.8.0
```

## 3. 依赖风险

```
syscall: 'open',
  path: 'C:\\nonexistent\\profiles\\desktop\\package.json'
}

Node.js v25.8.0
```

## 4. Prompt 变量

```
node:fs:436
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^

Error: ENOENT: no such file or directory, open 'C:\nonexistent\profiles\desktop\package.json'
    at readFileSync (node:fs:436:20)
    at file:///<home>/Desktop/mini-harness/oss/dsh-turnstile/tools/prompt-vars.mjs:12:24
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
    at async node:internal/modules/esm/loader:639:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
```

## 5. 决策登记（key 带版本号，升级即失效）

(暂无)

## 6. 最近闸门运行

(暂无)

## 5.1 决策是否过期

```
summary: every decision matches an installed version
```

## 5.2 自上次闸门后的 bundle 变化

```
no gate run with a bundle snapshot yet
```

## 6.1 闸门统计

```
runs: 12
  clear           12
blocked by check:
  (none)
decisions: 0
```

## 7. 怎么用

```bash
node tools/preflight.mjs <profileDir>     # 装前闸门（五项阻塞）
node scripts/install-plugin.mjs <profileDir> <包@版本>   # 一条命令装完并过闸
node tools/report.mjs <profileDir>        # 重新生成本页
```
