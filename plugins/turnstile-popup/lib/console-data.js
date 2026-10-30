// Read-only console snapshot. This file is copied into the host plugin by build-popup.mjs.
// Manifest data is labelled "declared"; only runtime snapshot data may be labelled "observed".
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const cleanPath = (p) => String(p || '').replace(/\\/g, '/');
const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
};
const short = (name) => String(name).split('/').pop();

function patchRows(file) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*id:\s*([\w.@/-]+)\s*$/);
    if (!m) continue;
    const row = { id: m[1], name: '', disabled: false, config: {}, configSources: {}, source: { file: cleanPath(file), line: i + 1 } };
    const indent = (lines[i].match(/^\s*/) || [''])[0].length;
    let configIndent = null;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (/^\s*-\s*id:/.test(next)) break;
      const ni = (next.match(/^\s*/) || [''])[0].length;
      if (next.trim() && ni < indent) break;
      const name = next.match(/^\s*name:\s*['"]?([^'"\n]+?)['"]?\s*$/);
      if (name && configIndent === null) row.name = name[1].trim();
      if (/^\s*disabled:\s*true\s*$/.test(next) && configIndent === null) row.disabled = true;
      if (/^\s*config:\s*$/.test(next)) { configIndent = ni; continue; }
      if (configIndent !== null && next.trim() && ni <= configIndent) configIndent = null;
      const setting = next.match(/^\s+([\w.-]+):\s*(.*?)\s*$/);
      const inConfig = configIndent !== null && ni > configIndent;
      if (setting && (inConfig || /^(slot|anchor|order)$/.test(setting[1]))) {
        row.config[setting[1]] = setting[2].replace(/^['"]|['"]$/g, '');
        row.configSources[setting[1]] = { file: cleanPath(file), line: j + 1 };
      }
    }
    found.push(row);
  }
  return found;
}

export function collectConsoleData(profileDir, options = {}) {
  const profilePackagePath = join(profileDir, 'package.json');
  const profilePackage = readJson(profilePackagePath);
  if (!profilePackage) throw new Error('not a readable profile: ' + profileDir);
  const profileName = basename(profileDir);
  const state = options.stateDir || process.env.DSH_TURNSTILE_STATE || join(profileDir, '..', '..', 'turnstile-state');
  const bundleNames = profilePackage.dsh?.profile?.bundles || Object.keys(profilePackage.dependencies || {});
  const profilePatchPath = join(profileDir, 'cordis.patch.yml');
  const profileRows = patchRows(profilePatchPath);
  const profileById = new Map(profileRows.map((r) => [r.id, r]));
  const plugins = [];
  const surfacesByName = new Map();
  const nodes = [];
  const addNode = (node) => { nodes.push({ evidence: 'declared', properties: {}, ...node }); return node.id; };
  const rootId = addNode({
    id: 'profile', kind: 'profile', label: profileName, parent: null,
    source: { file: cleanPath(profilePackagePath), line: 1 },
    properties: { 类型: 'DSH profile', 插件数: bundleNames.length, 路径: cleanPath(profileDir) },
  });

  bundleNames.forEach((name, pluginIndex) => {
    const base = join(profileDir, 'node_modules', name);
    const manifestPath = join(base, 'package.json');
    const manifest = readJson(manifestPath);
    const pid = 'plugin:' + pluginIndex;
    const pluginRows = [];
    let patchPath = '';
    if (manifest) {
      const rel = manifest.dsh?.bundle?.patch;
      if (rel) {
        patchPath = join(base, String(rel).replace(/^\.\//, ''));
        pluginRows.push(...patchRows(patchPath));
      }
    }
    const overlays = pluginRows.length
      ? profileRows.filter((r) => pluginRows.some((p) => p.id === r.id))
      : profileRows.filter((r) => r.name === name || r.name.startsWith(name + '/'));
    const ids = [...new Set([...pluginRows.map((r) => r.id), ...overlays.map((r) => r.id)])];
    const disabled = overlays.some((r) => r.disabled);
    const inject = manifest?.dsh?.client?.inject || [];
    const ui = [...new Set(inject.filter((s) => /ui-/.test(s)).map((s) => String(s).replace('@deepseek-ai/dsh-client-', '')))];
    for (const row of pluginRows) if (/^ui-/.test(row.id) && !ui.includes(row.id)) ui.push(row.id);
    const plugin = {
      name, version: manifest?.version || '', missing: !manifest, disabled,
      row: ids[0] || '', rows: ids, ui, engineRange: manifest?.engines?.dsh || '',
      manifest: cleanPath(manifestPath), architectureId: pid,
    };
    plugins.push(plugin);
    addNode({
      id: pid, kind: 'plugin', label: name, parent: rootId, source: { file: cleanPath(manifestPath), line: 1 },
      status: !manifest ? 'missing' : disabled ? 'disabled' : 'enabled',
      properties: { 类型: '插件', 版本: plugin.version || '未安装', 状态: !manifest ? '未安装' : disabled ? '已停用' : '配置启用', 配置行: ids.length, UI面: ui.length },
    });
    addNode({
      id: pid + ':manifest', kind: 'source', label: 'package.json', parent: pid,
      source: { file: cleanPath(manifestPath), line: 1 },
      properties: { 类型: '插件清单', 证据: '文件声明', 路径: cleanPath(manifestPath) },
    });

    if (manifest?.dsh?.bundle || manifest?.main) {
      const hid = pid + ':host';
      addNode({
        id: hid, kind: 'runtime', label: 'Host / bundle', parent: pid,
        source: { file: cleanPath(manifestPath), line: 1 },
        properties: { 类型: '宿主侧', 证据: '清单声明，非运行态', 配置行: pluginRows.length, 覆盖行: overlays.length },
      });
      pluginRows.forEach((row, rowIndex) => {
        const rid = hid + ':row:' + rowIndex;
        addNode({
          id: rid, kind: 'row', label: row.id, parent: hid, source: row.source,
          properties: { 类型: '插件配置行', 行ID: row.id, 名称: row.name || '未声明', 配置字段: Object.keys(row.config).join(', ') || '无' },
        });
        Object.entries(row.config).forEach(([key, value]) => {
          const cid = rid + ':config:' + key;
          addNode({ id: cid, kind: 'config', label: key + ' = ' + value, parent: rid, source: row.source,
            properties: { 类型: '配置字段', 字段: key, 值: value, 来源: '插件 patch' } });
          addNode({ id: cid + ':source', kind: 'source', label: basename(row.source.file) + ':' + (row.configSources[key] || row.source).line, parent: cid, source: row.configSources[key] || row.source,
            properties: { 类型: '源码位置', 路径: (row.configSources[key] || row.source).file, 行: (row.configSources[key] || row.source).line } });
        });
        addNode({ id: rid + ':source', kind: 'source', label: basename(row.source.file) + ':' + row.source.line, parent: rid, source: row.source,
          properties: { 类型: '源码位置', 路径: row.source.file, 行: row.source.line } });
      });
      overlays.forEach((row, overlayIndex) => {
        const oid = hid + ':override:' + overlayIndex;
        addNode({ id: oid, kind: 'override', label: '覆盖 · ' + row.id, parent: hid, source: row.source,
          properties: { 类型: 'profile 覆盖行', 行ID: row.id, 停用: row.disabled ? '是' : '否', 配置字段: Object.keys(row.config).join(', ') || '无' } });
        Object.entries(row.config).forEach(([key, value]) => {
          const cid = oid + ':config:' + key;
          addNode({ id: cid, kind: 'config', label: key + ' = ' + value, parent: oid, source: row.source,
            properties: { 类型: 'profile 配置字段', 字段: key, 值: value, 来源: 'cordis.patch.yml' } });
          addNode({ id: cid + ':source', kind: 'source', label: basename(row.source.file) + ':' + (row.configSources[key] || row.source).line, parent: cid, source: row.configSources[key] || row.source,
            properties: { 类型: '源码位置', 路径: (row.configSources[key] || row.source).file, 行: (row.configSources[key] || row.source).line } });
        });
        addNode({ id: oid + ':source', kind: 'source', label: basename(row.source.file) + ':' + row.source.line, parent: oid, source: row.source,
          properties: { 类型: '源码位置', 路径: row.source.file, 行: row.source.line } });
      });
    }

    if (manifest?.dsh?.client) {
      const cid = pid + ':client';
      addNode({ id: cid, kind: 'runtime', label: 'Client / browser', parent: pid,
        source: { file: cleanPath(manifestPath), line: 1 },
        properties: { 类型: '浏览器侧', 证据: '清单声明，非运行态', 平台: manifest.dsh.client.platform || '未声明', UI面: ui.length } });
      ui.forEach((surface, surfaceIndex) => {
        const sid = cid + ':surface:' + surfaceIndex;
        addNode({ id: sid, kind: 'surface', label: surface, parent: cid, source: { file: cleanPath(manifestPath), line: 1 },
          properties: { 类型: 'UI 面', 名称: surface, 所属插件: name, 证据: 'client.inject / patch 声明' } });
        const relatedRows = pluginRows.length ? pluginRows : overlays;
        relatedRows.forEach((row, rowIndex) => {
          const rid = sid + ':row:' + rowIndex;
          addNode({ id: rid, kind: 'row', label: row.id, parent: sid, source: row.source,
            properties: { 类型: '关联配置行', 行ID: row.id, 位置字段: Object.keys(row.config).join(', ') || '未声明' } });
          Object.entries(row.config).forEach(([key, value]) => {
            const cfgid = rid + ':config:' + key;
            addNode({ id: cfgid, kind: key === 'slot' || key === 'anchor' ? 'slot' : 'config', label: key + ' = ' + value, parent: rid, source: row.source,
              properties: { 类型: key === 'slot' || key === 'anchor' ? '位置 / slot' : '配置字段', 字段: key, 值: value } });
            addNode({ id: cfgid + ':source', kind: 'source', label: basename(row.source.file) + ':' + (row.configSources[key] || row.source).line, parent: cfgid, source: row.configSources[key] || row.source,
              properties: { 类型: '源码位置', 路径: (row.configSources[key] || row.source).file, 行: (row.configSources[key] || row.source).line } });
          });
          addNode({ id: rid + ':source', kind: 'source', label: basename(row.source.file) + ':' + row.source.line, parent: rid, source: row.source,
            properties: { 类型: '源码位置', 路径: row.source.file, 行: row.source.line } });
        });
        if (!surfacesByName.has(surface)) surfacesByName.set(surface, []);
        surfacesByName.get(surface).push({ name, architectureId: sid, rows: ids, manifest: cleanPath(manifestPath) });
      });
    }
  });

  const surfaces = [...surfacesByName.entries()].map(([surface, plugins]) => ({
    surface, count: plugins.length, plugins, contested: plugins.length > 1,
  })).sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));
  const report = readJson(join(state, 'report-' + profileName + '.json'));
  const historyFile = readJson(join(state, 'gate-history.json'));
  const history = (historyFile?.runs || []).filter((r) => !r.profile || String(r.profile) === profileDir || basename(String(r.profile)) === profileName).slice(-40).reverse();
  const runtime = readJson(join(state, 'runtime-' + profileName + '.json'));
  const occupancy = readJson(join(state, 'occupancy-' + profileName + '.json'));
  return {
    schema: 'turnstile/console@1', generatedAt: new Date().toISOString(),
    profile: { name: profileName, dir: cleanPath(profileDir), bundles: bundleNames.length },
    plugins, surfaces, architecture: { rootId, nodes }, report, history, runtime, occupancy,
    coverage: {
      manifest: true, report: Boolean(report), history: Boolean(historyFile), runtime: Boolean(runtime), occupancy: Boolean(occupancy),
      note: '架构默认来自清单和 patch；只有 runtime 快照存在时才提供运行态观测。',
    },
  };
}
