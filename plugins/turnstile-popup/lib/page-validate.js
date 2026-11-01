// 页面树的严格校验与 schema 迁移（handoff P0：恢复时只查 schema/root 不够）。
// 目的：坏页面在进入渲染器之前就被拦住，并给出人能看懂的错。
import { COMPONENTS, PAGE_SCHEMA } from './page-model.js';

export const MAX_NODES = 2000;
export const MAX_DEPTH = 32;

/** 迁移：只有 @1 → @1；未来加 @2 时在这里做版本升级，未知版本明确拒绝。 */
export function migratePage(page) {
  if (!page || typeof page !== 'object') return { ok: false, errors: ['页面不是对象'] };
  const schema = page.schema;
  if (schema === PAGE_SCHEMA) return { ok: true, page, from: schema, migrated: false };
  if (typeof schema === 'string' && /^mini\/page@\d+$/.test(schema)) {
    return { ok: false, errors: ['不支持更旧的页面版本：' + schema + '（当前 ' + PAGE_SCHEMA + '）'] };
  }
  return { ok: false, errors: ['缺少或无法识别的 schema（期望 ' + PAGE_SCHEMA + '）'] };
}

function checkNode(node, path, errors, seen, depth) {
  if (depth > MAX_DEPTH) { errors.push(path + '：层级超过 ' + MAX_DEPTH); return; }
  if (!node || typeof node !== 'object' || Array.isArray(node)) { errors.push(path + '：节点不是对象'); return; }
  const id = node.id;
  if (typeof id !== 'string' || !id) errors.push(path + '：缺少 id');
  else if (seen.has(id)) errors.push(path + '：id 重复（' + id + '）');
  else seen.add(id);
  const spec = COMPONENTS[node.type];
  if (!spec) { errors.push(path + '：未知组件类型 ' + String(node.type)); return; }
  if (node.props != null && (typeof node.props !== 'object' || Array.isArray(node.props))) errors.push(path + '：props 必须是对象');
  const kids = node.children;
  if (kids != null && !Array.isArray(kids)) { errors.push(path + '：children 必须是数组'); return; }
  if (Array.isArray(kids) && kids.length && !spec.capabilities.acceptsChildren) {
    errors.push(path + '：' + node.type + ' 不接受子节点');
  }
  // 递归交给调用方（这里只检查自己，避免同一个子节点被检查两遍）
}

export function validatePageTree(page) {
  const m = migratePage(page);
  if (!m.ok) return m;
  const errors = [];
  const root = page.root;
  if (!root || typeof root !== 'object') return { ok: false, errors: ['缺少 root'] };
  if (root.type !== 'stack') errors.push('root：根节点必须是 stack');
  const seen = new Set();
  let count = 0;
  (function walk(n, depth) {
    count += 1;
    if (count > MAX_NODES) return;
    checkNode(n, n && n.id ? n.id : 'root', errors, seen, depth);
    if (Array.isArray(n && n.children)) n.children.forEach((c) => walk(c, depth + 1));
  })(root, 0);
  if (count > MAX_NODES) errors.push('节点数量超过上限 ' + MAX_NODES);
  return { ok: errors.length === 0, errors: errors.slice(0, 20), count };
}
