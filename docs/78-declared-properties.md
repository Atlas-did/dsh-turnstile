# The properties pane is now declared, not drawn

docs/74 shipped the field model and declared exactly one field (the anchor input), leaving the identity and
source groups as hand-written markup. This round moved them over, so the pane has one source of truth.

## Declarations

```js
identityDecls() -> 名称 / 版本 / 行 ID / UI 面        (group 'Identity / 标识')
sourceDecls()   -> manifest / 源码位置              (group 'Source / 来源')
configFields()  -> 停用 / anchor                    (group 'Config / 可编辑属性')
```

and one renderer for read-only groups:

```js
readonlyGroup(fields, values)  // <div class=prop data-testid=prop-<key>><dt>label</dt><dd>value</dd>
```

Values still come from the collected data (`readonlyValues(p)`), which keeps the schema purely structural:
a field says what it *is*, not where the number comes from.

## Verification (designer e2e 39 -> 40/40)

```
PASS  read-only properties are generated from declarations   6/6 rows present
```

The check counts six `prop-*` testids - if a group silently fell back to markup, one of them would be
missing and the `data-testid` would not exist.

## Still hand-drawn

`Config` (the editable group) is partly hand-built: the checkbox and the input are constructed directly,
and only their *validation* comes from the declaration. Rendering an input from `type: 'boolean'` /
`type: 'text'` would finish the job; not done.
