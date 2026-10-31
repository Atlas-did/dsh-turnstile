# Declarations now decide the controls too (P0-4 complete)

docs/78 left the `Config` group half-declared: values were validated from the schema, but the checkbox and
the text input were still constructed by hand. This round moved the *control choice* into the schema.

## `controlSpec`

```js
controlSpec(field, value) -> { kind: 'checkbox' | 'text' | 'select' | 'number', value, options }
```

Pure, so it is unit tested (field-schema tests 7 -> **9**): a `boolean` field yields a checkbox with a
boolean value, a `text` field yields a string, a `select` yields its options, and a missing value falls back
to the declared default.

## Wired

```js
const specFor = (key) => FS.controlSpec(declList.find((f) => f.key === key), configValues(p)[key]);
const disabledSpec = specFor('disabled');
node('input', { type: disabledSpec.kind, 'data-field-kind': disabledSpec.kind, ... })
```

The DOM now carries `data-field-kind`, which is how the test tells a declaration-driven control from a
hand-built one.

Designer e2e 40 -> **42/42**:

| Check | Evidence |
|---|---|
| the checkbox is the declared kind | `data-field-kind="checkbox"` |
| the anchor input is the declared kind | `data-field-kind="text"` |

## What P0-4 means now

Every field in the properties pane is declared once (type, group, default, visibility, validation), the
panel renders from that declaration, and validation reads the same object. No second source of truth is
left in the pane.

Still not declared: the operation queue rows and the diff view - they are not property fields.

## Regression

```
console e2e      62/62
panel e2e        29/29
designer e2e     42/42
virtual list     all checks passed
selftest         67 passed / 6 skipped
package tests    15 groups (field-schema now 9 checks)
```
