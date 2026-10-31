// Node capabilities: what a node is allowed to do, decided by data, not by the UI.
//
// Shape taken from Designable's node rules (draggable / droppable / deletable / cloneable /
// resizable): the canvas asks the model "can this happen?", the model answers with a boolean and
// a reason. The renderer never decides on its own.
//
// Why a reason is mandatory: a disabled button without a reason is a dead end. Every refusal here
// has to name the fact that caused it, so the user can go fix that fact.
//
// Browser delivery follows the same route the other models use: console-server strips `export`
// and publishes window.TurnstileCapabilities before inspector-model.js loads.

export const CAPABILITIES = ['toggle', 'anchor', 'locate', 'fuse', 'export'];

const allow = () => ({ allowed: true, reason: '' });
const deny = (reason) => ({ allowed: false, reason });

export function pluginCapabilities(plugin) {
  const p = plugin || {};
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const writable = rows.length > 0;
  const why = writable ? '' : '该插件没有 profile 行，cordis.patch.yml 里无处可写';

  const capabilities = {
    toggle: writable ? allow() : deny(why),
    anchor: !writable ? deny(why) : (p.hardcoded ? deny('该位置由插件硬编码，改不了') : allow()),
    locate: allow(),
  };
  return { capabilities, allowed: Object.keys(capabilities).filter((k) => capabilities[k].allowed) };
}

export function surfaceCapabilities(surface) {
  const s = surface || {};
  const count = Number(s.count) || 0;
  const capabilities = {
    fuse: count > 1 ? allow() : deny('只有一个插件占用这个面，没有可融合的对象'),
  };
  return { capabilities, allowed: Object.keys(capabilities).filter((k) => capabilities[k].allowed) };
}

export function checkCapabilities() {
  const capabilities = { export: allow() };
  return { capabilities, allowed: Object.keys(capabilities).filter((k) => capabilities[k].allowed) };
}

if (typeof window !== 'undefined') window.TurnstileCapabilities = { pluginCapabilities, surfaceCapabilities, checkCapabilities, CAPABILITIES };
