// Field schema: a property panel field is declared once - type, group, default, visibility and
// validation - and the renderer plus the validator both read that declaration.
//
// Shape taken from Formily / RJSF: data schema separated from UI schema. What we take is the split, not
// their code (MIT, shapes only). Two rules matter here:
//
//   1. a field that is not visible cannot produce an error (hidden fields are not validated);
//   2. an error names the field it belongs to, so the UI can point at the row instead of showing
//      one vague 'save failed'.

export function field(spec) {
  const f = spec || {};
  return {
    key: String(f.key || ''),
    label: f.label || f.key || '',
    type: f.type || 'text',
    group: f.group || '基本',
    defaultValue: f.defaultValue,
    when: typeof f.when === 'function' ? f.when : null,
    validate: typeof f.validate === 'function' ? f.validate : null,
    options: Array.isArray(f.options) ? f.options.slice() : null,
  };
}

/** Only the fields whose `when(values)` passes. Unknown keys in `values` never affect visibility. */
export function visibleFields(fields, values) {
  const v = values || {};
  return (Array.isArray(fields) ? fields : []).filter((f) => (f && f.when ? Boolean(f.when(v)) : true));
}

export function coerce(f, raw) {
  if (!f) return raw;
  if (f.type === 'boolean') return raw === true || raw === 'true' || raw === 1 || raw === '1';
  if (f.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : f.defaultValue;
  }
  return raw === undefined || raw === null ? '' : String(raw);
}

/** Field-level errors. Hidden fields are skipped, and an empty result means valid. */
export function validateValues(fields, values) {
  const v = values || {};
  const errors = [];
  for (const f of visibleFields(fields, v)) {
    const value = coerce(f, v[f.key]);
    if (f.validate) {
      const verdict = f.validate(value, v);
      if (verdict === false) errors.push({ key: f.key, message: f.label + '不合法' });
      else if (typeof verdict === 'string' && verdict) errors.push({ key: f.key, message: verdict });
    }
  }
  return errors;
}

/** Apply one edit and report the field errors that edit introduced. */
export function applyEdit(fields, values, key, raw) {
  const f = (Array.isArray(fields) ? fields : []).find((x) => x && x.key === key);
  const next = Object.assign({}, values || {});
  if (f) next[key] = coerce(f, raw);
  return { values: next, errors: validateValues(fields, next) };
}

/** Grouped view for rendering: [{ group, fields: [...] }] in declaration order. */
export function groupFields(fields, values) {
  const out = [];
  for (const f of visibleFields(fields, values)) {
    let g = out.find((x) => x.group === f.group);
    if (!g) { g = { group: f.group, fields: [] }; out.push(g); }
    g.fields.push(f);
  }
  return out;
}

/**
 * What control renders this field, and with what value. Pure: the page turns the spec into DOM, so the
 * decision "which control" belongs to the declaration too.
 */
export function controlSpec(f, value) {
  if (!f) return { kind: 'text', value: '', options: null };
  const v = value === undefined ? f.defaultValue : value;
  if (f.type === 'boolean') return { kind: 'checkbox', value: Boolean(v), options: null };
  if (f.type === 'select') return { kind: 'select', value: v === undefined ? '' : String(v), options: f.options || [] };
  if (f.type === 'number') return { kind: 'number', value: v === undefined || v === '' ? '' : String(v), options: null };
  return { kind: 'text', value: v === undefined || v === null ? '' : String(v), options: null };
}

if (typeof window !== 'undefined') window.TurnstileFields = { field, visibleFields, coerce, validateValues, applyEdit, groupFields, controlSpec };
