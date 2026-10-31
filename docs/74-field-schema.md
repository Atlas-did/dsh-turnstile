# Schema-driven fields: declared once, rendered and validated from the declaration

P0-4. Shape taken from Formily / RJSF's split between a data schema and a UI schema (MIT, shapes only).
What was taken is the split and two rules, not their code:

1. **a hidden field cannot produce an error** - visibility is part of validation, not decoration;
2. **an error names its field**, so the panel can point at the input instead of showing one vague
   "save failed".

## Module

`lib/field-schema.js`:

```js
field({ key, label, type, group, defaultValue, when, validate, options })
visibleFields(fields, values)   // when(values) gates rendering AND validation
coerce(field, raw)              // boolean / number / text, explicit
validateValues(fields, values)  // [{ key, message }]
applyEdit(fields, values, k, v) // { values, errors }
groupFields(fields, values)     // [{ group, fields }] in declaration order
```

`test/field-schema.test.mjs` - 7 checks: hidden field not rendered, hidden field cannot error, coercion
(including a bad number falling back to the default), errors name the field, valid edit clears errors,
unknown key ignored, grouping keeps declaration order.

## Wired

The designer's `anchor` input is declared, not hand-checked:

```js
FS.field({ key: 'anchor', label: 'anchor', group: 'Config / 可编辑属性',
  validate: (v) => (!v || ['top-left','top-right','bottom-left','bottom-right'].includes(v) ? true : '位置必须是 top-left / ... 或留空') })
```

and the panel updates the message **in place while typing** (`refreshAnchorError`), because a full
re-render would drop focus.

Designer e2e 35 -> **37/37**:

| Check | Evidence |
|---|---|
| schema validation flags the field | typing `center` shows `位置必须是 ...` |
| a valid value clears the field error | typing `top-left` empties the message |

## Honest gaps

* Only **one** field is declared so far. The rest of the properties pane (identity, source) is still
  hand-written markup; declaring them is mechanical, not done.
* `when` (conditional visibility) is implemented and tested but not used by any field yet - no field in
  this panel depends on another.
* The validation rule lives in the panel's declaration, not in `capabilities.js`; whether an anchor is
  *permitted* (hardcoded position) is still the capability model's job. Two different questions:
  "is this value well-formed" vs "may this plugin be moved at all".
