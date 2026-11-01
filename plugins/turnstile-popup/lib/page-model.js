'use strict';
// 页面搭建器的数据层：组件注册表 + 命令 + 快照。
//
// 抄的是三个项目的「机制」，不是代码：
//   Designable  —— 组件自己声明能力（能不能拖、能不能装子节点、能不能改大小），引擎只读声明不猜；
//   wxFormBuilder —— 命令模式（每步可逆）+ 保留快照（能跳回某个时刻）；
//   LowCodeEngine/Formily —— 属性面板由 propsSchema 生成（类型/默认值/枚举）。
//
// 纯数据：不碰 DOM、不碰网络，方便直接在 node 里测。

export const PAGE_SCHEMA = 'mini/page@1';

/** 组件注册表：每种组件的默认属性、可放子节点、可改大小的声明。 */
export const COMPONENTS = Object.freeze({
  heading: {
    label: '标题',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { text: '未命名标题', level: 2 },
    propsSchema: {
      text: { type: 'string', label: '文字', default: '未命名标题' },
      level: { type: 'enum', label: '级别', default: 2, options: [1, 2, 3] },
    },
  },
  text: {
    label: '文本',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { text: '一段说明' },
    propsSchema: { text: { type: 'string', label: '文字', default: '一段说明', multiline: true } },
  },
  panel: {
    label: '面板',
    capabilities: { draggable: true, droppable: true, acceptsChildren: true },
    defaults: { title: '面板', padding: 12 },
    propsSchema: {
      title: { type: 'string', label: '标题', default: '面板' },
      padding: { type: 'number', label: '内边距', default: 12, min: 0, max: 48 },
    },
  },
  stack: {
    label: '堆叠（Sizer）',
    capabilities: { draggable: true, droppable: true, acceptsChildren: true },
    defaults: { direction: 'column', gap: 8 },
    propsSchema: {
      direction: { type: 'enum', label: '方向', default: 'column', options: ['row', 'column'] },
      gap: { type: 'number', label: '间距', default: 8, min: 0, max: 40 },
    },
  },
  grid: {
    label: '网格（Sizer）',
    capabilities: { draggable: true, droppable: true, acceptsChildren: true },
    defaults: { columns: 2, gap: 10 },
    propsSchema: {
      columns: { type: 'number', label: '列数', default: 2, min: 1, max: 6 },
      gap: { type: 'number', label: '间距', default: 10, min: 0, max: 40 },
    },
  },
  // 数据来源：留空=手写数据；填 plugins/health/occupancy=运行时从宿主端点取。
  dataTable: {
    label: '数据表（绑定）',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { source: 'plugins' },
    propsSchema: {
      source: { type: 'enum', label: '数据源', default: 'plugins', options: ['plugins', 'health', 'occupancy'] },
    },
  },
  dataChart: {
    label: '数据图（绑定）',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { source: 'occupancy', kind: 'bar' },
    propsSchema: {
      source: { type: 'enum', label: '数据源', default: 'occupancy', options: ['occupancy', 'health', 'plugins'] },
      kind: { type: 'enum', label: '类型', default: 'bar', options: ['bar', 'line', 'pie'] },
    },
  },
  table: {
    label: '表格',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { columns: '名称, 状态', rows: 'alpha, 启用\nbeta, 停用' },
    propsSchema: {
      columns: { type: 'string', label: '列名（逗号分隔）', default: '名称, 状态' },
      rows: { type: 'string', label: '行（每行一行，逗号分隔）', default: 'alpha, 启用', multiline: true },
    },
  },
  chart: {
    label: '图表',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { kind: 'bar', title: '分布', series: 'ui-settings: 7\nui-conversation: 8\nui-renderer: 4' },
    propsSchema: {
      kind: { type: 'enum', label: '类型', default: 'bar', options: ['bar', 'line', 'pie'] },
      title: { type: 'string', label: '标题', default: '分布' },
      series: { type: 'string', label: '数据（每行 标签:数值）', default: 'A: 1', multiline: true },
    },
  },
  image: {
    label: '图片',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { src: '', alt: '' },
    propsSchema: {
      src: { type: 'string', label: '地址：http(s)://… 或 asset:绝对路径（docs/img、state 下的图）', default: '' },
      alt: { type: 'string', label: '替代文字', default: '' },
    },
  },
  stat: {
    label: '指标卡',
    capabilities: { draggable: true, droppable: false, acceptsChildren: false },
    defaults: { value: '0', label: '指标', tone: 'neutral' },
    propsSchema: {
      label: { type: 'string', label: '名称', default: '指标' },
      value: { type: 'string', label: '数值', default: '0' },
      tone: { type: 'enum', label: '色调', default: 'neutral', options: ['neutral', 'good', 'warn', 'bad'] },
    },
  },
});


/** 所有组件共用的样式声明（样式面板从这里生成）。 */
export const STYLE_SCHEMA = Object.freeze({
  padding: { type: 'number', label: '内边距', default: 0, min: 0, max: 48 },
  align: { type: 'enum', label: '对齐', default: 'left', options: ['left', 'center', 'right'] },
  tone: { type: 'enum', label: '底色', default: 'none', options: ['none', 'panel', 'accent'] },
  width: { type: 'enum', label: '宽度', default: 'auto', options: ['auto', 'half', 'full'] },
  // B4：自由值，不再只有枚举
  color: { type: 'string', label: '文字颜色（#rrggbb，空=默认）', default: '' },
  fontSize: { type: 'number', label: '字号', default: 0, min: 0, max: 40 },
  radius: { type: 'number', label: '圆角', default: 0, min: 0, max: 24 },
});

export function defaultStyle() {
  return { padding: 0, align: 'left', tone: 'none', width: 'auto', color: '', fontSize: 0, radius: 0 };
}

let seq = 0;
export function resetIds() { seq = 0; }
export function nextId(type) { seq += 1; return type + '-' + seq; }

export function newNode(type, props = {}) {
  const spec = COMPONENTS[type];
  if (!spec) throw new Error('unknown component: ' + type);
  return { id: nextId(type), type, props: { ...spec.defaults, ...props }, style: defaultStyle(), children: [] };
}

export function newPage() {
  const root = newNode('stack', { direction: 'column', gap: 10 });
  return { schema: PAGE_SCHEMA, root, meta: { createdAt: new Date().toISOString() } };
}

export function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children || []) { const hit = findNode(c, id); if (hit) return hit; }
  return null;
}

export function findParent(node, id, parent = null) {
  if (!node) return null;
  if (node.id === id) return parent;
  for (const c of node.children || []) { const hit = findParent(c, id, node); if (hit) return hit; }
  return null;
}

export function capabilitiesOf(type) {
  const spec = COMPONENTS[type];
  return spec ? spec.capabilities : { draggable: false, droppable: false, acceptsChildren: false };
}

function cloneWithNewIds(node) {
  if (!node || !COMPONENTS[node.type]) throw new Error('不能粘贴未知组件');
  return {
    id: nextId(node.type),
    type: node.type,
    props: JSON.parse(JSON.stringify(node.props || {})),
    style: { ...defaultStyle(), ...JSON.parse(JSON.stringify(node.style || {})) },
    children: (node.children || []).map(cloneWithNewIds),
  };
}

/** 命令层：每个命令都返回新的 page（不可变），失败时抛错并说明原因。 */
export function applyCommand(page, cmd) {
  const next = JSON.parse(JSON.stringify(page));
  switch (cmd.type) {
    case 'add': {
      const parent = findNode(next.root, cmd.parentId) || next.root;
      const caps = capabilitiesOf(parent.type);
      if (!caps.acceptsChildren) throw new Error(parent.type + ' 不接受子节点');
      const node = newNode(cmd.component, cmd.props || {});
      const at = Number.isInteger(cmd.index) ? Math.max(0, Math.min(cmd.index, parent.children.length)) : parent.children.length;
      parent.children.splice(at, 0, node);
      return { page: next, focus: node.id };
    }
    case 'paste': {
      const parent = findNode(next.root, cmd.parentId);
      if (!parent) throw new Error('粘贴目标不存在');
      if (!capabilitiesOf(parent.type).acceptsChildren) throw new Error(parent.type + ' 不接受子节点');
      const node = cloneWithNewIds(cmd.node);
      const at = Number.isInteger(cmd.index) ? Math.max(0, Math.min(cmd.index, parent.children.length)) : parent.children.length;
      parent.children.splice(at, 0, node);
      return { page: next, focus: node.id };
    }
    case 'move': {
      const node = findNode(next.root, cmd.nodeId);
      if (!node) throw new Error('找不到节点 ' + cmd.nodeId);
      if (cmd.nodeId === next.root.id) throw new Error('根节点不能移动');
      if (!capabilitiesOf(node.type).draggable) throw new Error(node.type + ' 声明为不可拖拽');
      const from = findParent(next.root, cmd.nodeId);
      const to = findNode(next.root, cmd.parentId);
      if (!from || !to) throw new Error('移动目标不存在');
      if (!capabilitiesOf(to.type).acceptsChildren) throw new Error(to.type + ' 不接受子节点');
      if (findNode(node, to.id)) throw new Error('不能把节点移到它自己的子树里');
      from.children = from.children.filter((c) => c.id !== node.id);
      const at = Number.isInteger(cmd.index) ? Math.max(0, Math.min(cmd.index, to.children.length)) : to.children.length;
      to.children.splice(at, 0, node);
      return { page: next, focus: node.id };
    }
    case 'pasteMany': {
      const parent = findNode(next.root, cmd.parentId);
      if (!parent) throw new Error('粘贴目标不存在');
      if (!capabilitiesOf(parent.type).acceptsChildren) throw new Error(parent.type + ' 不接受子节点');
      if (!Array.isArray(cmd.nodes) || !cmd.nodes.length) throw new Error('剪贴板是空的');
      const cloned = cmd.nodes.map((n) => cloneWithNewIds(n));
      const at = Number.isInteger(cmd.index) ? Math.max(0, Math.min(cmd.index, parent.children.length)) : parent.children.length;
      parent.children.splice(at, 0, ...cloned);
      return { page: next, focus: cloned[0].id };
    }
    case 'removeMany': {
      if (!Array.isArray(cmd.nodeIds) || !cmd.nodeIds.length) throw new Error('批量删除至少选择一个节点');
      const ids = new Set(cmd.nodeIds);
      if (ids.has(next.root.id)) throw new Error('根节点不能删除');
      // 先全部验证：任何一个不存在就整体失败，不留下半删状态
      for (const id of ids) if (!findNode(next.root, id)) throw new Error('找不到节点 ' + id);
      // 选中的祖先已包含某个后代时，只删祖先（否则会重复删）
      const rootsToDelete = new Set([...ids].filter((id) => {
        let p = findParent(next.root, id);
        while (p) { if (ids.has(p.id)) return false; p = findParent(next.root, p.id); }
        return true;
      }));
      const strip = (node) => {
        if (!Array.isArray(node.children)) return node;
        node.children = node.children.filter((c) => !rootsToDelete.has(c.id));
        node.children.forEach(strip);
        return node;
      };
      strip(next.root);
      return { page: next, focus: next.root.id };
    }
    case 'remove': {
      if (cmd.nodeId === next.root.id) throw new Error('根节点不能删除');
      const parent = findParent(next.root, cmd.nodeId);
      if (!parent) throw new Error('找不到节点 ' + cmd.nodeId);
      parent.children = parent.children.filter((c) => c.id !== cmd.nodeId);
      return { page: next, focus: parent.id };
    }
    case 'setStyle': {
      const node2 = findNode(next.root, cmd.nodeId);
      if (!node2) throw new Error('找不到节点 ' + cmd.nodeId);
      const spec2 = STYLE_SCHEMA[cmd.key];
      if (!spec2) throw new Error('没有样式项 ' + cmd.key);
      node2.style = node2.style || defaultStyle();
      node2.style[cmd.key] = coerce(spec2, cmd.value);
      return { page: next, focus: node2.id };
    }
    case 'setProp': {
      const node = findNode(next.root, cmd.nodeId);
      if (!node) throw new Error('找不到节点 ' + cmd.nodeId);
      const spec = (COMPONENTS[node.type].propsSchema || {})[cmd.key];
      if (!spec) throw new Error(node.type + ' 没有属性 ' + cmd.key);
      node.props[cmd.key] = coerce(spec, cmd.value);
      return { page: next, focus: node.id };
    }
    case 'setPropMany':
    case 'setStyleMany': {
      if (!Array.isArray(cmd.nodeIds) || !cmd.nodeIds.length) throw new Error('批量编辑至少选择一个节点');
      const singleType = cmd.type === 'setPropMany' ? 'setProp' : 'setStyle';
      const seen = new Set();
      let batchPage = next;
      let focus = null;
      // 每次都在局部副本上应用同一个声明校验；中途失败时，调用者的原页面完全不变。
      for (const nodeId of cmd.nodeIds) {
        if (seen.has(nodeId)) continue;
        seen.add(nodeId);
        batchPage = applyCommand(batchPage, { type: singleType, nodeId, key: cmd.key, value: cmd.value }).page;
        focus = nodeId;
      }
      return { page: batchPage, focus };
    }
    default:
      throw new Error('未知命令 ' + cmd.type);
  }
}

/** 按声明把输入强制成正确类型；不合法就抛错（面板会显示原因）。 */
export function coerce(spec, value) {
  if (spec.type === 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error('需要数字');
    if (spec.min !== undefined && n < spec.min) throw new Error('不能小于 ' + spec.min);
    if (spec.max !== undefined && n > spec.max) throw new Error('不能大于 ' + spec.max);
    return n;
  }
  if (spec.type === 'enum') {
    const hit = (spec.options || []).find((o) => String(o) === String(value));
    if (hit === undefined) throw new Error('可选值只有 ' + (spec.options || []).join(' / '));
    return hit;
  }
  return String(value);
}

/**
 * 命令栈：past / future + 快照。
 * 与普通 undo 的区别：每次提交留一份快照（label + 时间 + 页面深拷贝），可以**跳到任意时刻**，
 * 不只是退一步。这是 wxFormBuilder「命令栈」+ Designable「历史」的合体。
 */
export function createStack(page, snapshotLimit = 40) {
  return {
    current: page,
    past: [],
    future: [],
    snapshots: [{ label: '初始', at: new Date().toISOString(), page: JSON.parse(JSON.stringify(page)) }],
    snapshotLimit,
  };
}

export function run(stack, cmd) {
  const { page, focus } = applyCommand(stack.current, cmd);
  const past = stack.past.concat([{ cmd, page: stack.current }]);
  const snapshot = { label: labelOf(cmd), at: new Date().toISOString(), page: JSON.parse(JSON.stringify(page)) };
  const snapshots = stack.snapshots.concat([snapshot]).slice(-stack.snapshotLimit);
  return { ...stack, current: page, past, future: [], snapshots, focus };
}

export function undo(stack) {
  if (!stack.past.length) return stack;
  const last = stack.past[stack.past.length - 1];
  return { ...stack, current: last.page, past: stack.past.slice(0, -1), future: [stack.current].concat(stack.future) };
}

export function redo(stack) {
  if (!stack.future.length) return stack;
  const next = stack.future[0];
  return { ...stack, current: next, past: stack.past.concat([{ cmd: null, page: stack.current }]), future: stack.future.slice(1) };
}

/** 跳到某个快照：后续仍可撤销（不丢历史）。 */
export function jumpTo(stack, index) {
  const snap = stack.snapshots[index];
  if (!snap) return stack;
  return { ...stack, current: JSON.parse(JSON.stringify(snap.page)), past: stack.past.concat([{ cmd: { type: 'jump', index }, page: stack.current }]), future: [] };
}

export function labelOf(cmd) {
  if (!cmd) return '未知';
  if (cmd.type === 'add') return '添加 ' + cmd.component;
  if (cmd.type === 'paste') return '粘贴 ' + ((cmd.node || {}).type || '节点');
  if (cmd.type === 'pasteMany') return '粘贴 ' + ((cmd.nodes || []).length) + ' 个节点';
  if (cmd.type === 'removeMany') return '删除 ' + ((cmd.nodeIds || []).length) + ' 个节点';
  if (cmd.type === 'move') return '移动节点';
  if (cmd.type === 'remove') return '删除节点';
  if (cmd.type === 'setProp') return '改 ' + cmd.key;
  if (cmd.type === 'setStyle') return '样式 ' + cmd.key;
  if (cmd.type === 'setPropMany') return '批量改 ' + cmd.key + '（' + cmd.nodeIds.length + ' 个节点）';
  if (cmd.type === 'setStyleMany') return '批量样式 ' + cmd.key + '（' + cmd.nodeIds.length + ' 个节点）';
  return cmd.type;
}

if (typeof window !== 'undefined') {
  window.TurnstilePageModel = { PAGE_SCHEMA, COMPONENTS, STYLE_SCHEMA, defaultStyle, newPage, newNode, findNode, findParent, capabilitiesOf, applyCommand, coerce, createStack, run, undo, redo, jumpTo, labelOf };
}
