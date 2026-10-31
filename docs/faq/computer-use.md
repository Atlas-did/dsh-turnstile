# Computer Use「装了没用」

**症状**：装完 `dsh-computer-use-mode`，找不到截图/鼠标键盘工具，以为装坏了。

**原因**：它**不是普通插件，是一个会话模式**。它的 `cordis.patch.yml` 开头写着：

> Declares exactly ONE row: a fifth agent preset, `computer`, which appears in the session picker
> alongside 标准模式 / PTC 模式 / 极简模式 / 创造模式

所以它不会给当前会话加工具，只有在**用「电脑操作模式」新建的会话**里才挂载。

**修法**：新建对话 → 模式选择器里选 **电脑操作模式**。

**看不到这个模式怎么办**：

1. 确认 `dsh.profile.bundles` 里有 `dsh-computer-use-mode`（`node tools/setup-check.mjs` 不覆盖这项，
   直接看 profile 的 package.json）；
2. 确认 `cordis.patch.yml` 里**没有**同名顶层行——它的注释明确说，多插一条顶层行会导致工具重复注册、
   插件列表出现红色「异常」；
3. 重启 DSH。

> 已知边界：本机验证到「bundle 在、无顶层重复行」这一步；**模式是否出现在选择器里没有截图证据**，
> 因为截图窗口看不到新建对话弹窗。这一条标 unverified。
