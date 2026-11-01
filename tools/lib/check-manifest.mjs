// 第三方检查器清单：只有用户显式传 --checks 时才加载，不做 profile 自动发现。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CHECK_MANIFEST_SCHEMA = 'turnstile/checks@1';
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

function fail(message) {
  throw new Error('检查器清单无效：' + message);
}

/**
 * 读取 turnstile/checks@1。脚本路径相对清单解析；每个脚本接收 <profile> --json。
 * 返回可直接交给 preflight 的声明，不执行清单中的代码。
 */
export function loadCheckManifest(file) {
  if (!file) fail('缺少清单路径');
  const manifestPath = resolve(file);
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) fail('文件不存在：' + manifestPath);
  let data;
  try { data = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch (error) { fail('JSON 无法解析：' + error.message); }
  if (!data || data.schema !== CHECK_MANIFEST_SCHEMA) fail('schema 必须是 ' + CHECK_MANIFEST_SCHEMA);
  if (!Array.isArray(data.checks) || !data.checks.length) fail('checks 必须是非空数组');

  const names = new Set();
  return data.checks.map((check, index) => {
    const at = 'checks[' + index + ']';
    if (!check || typeof check !== 'object' || Array.isArray(check)) fail(at + ' 必须是对象');
    if (typeof check.name !== 'string' || !NAME.test(check.name)) fail(at + '.name 只能使用小写字母、数字和连字符');
    if (names.has(check.name)) fail('检查器名称重复：' + check.name);
    names.add(check.name);
    if (typeof check.script !== 'string' || !check.script.trim()) fail(at + '.script 必须是非空字符串');
    if (check.hint != null && typeof check.hint !== 'string') fail(at + '.hint 必须是字符串');
    if (check.advisory != null && typeof check.advisory !== 'boolean') fail(at + '.advisory 必须是布尔值');
    const script = resolve(dirname(manifestPath), check.script);
    if (!existsSync(script) || !statSync(script).isFile()) fail(at + '.script 不存在：' + script);
    return {
      name: check.name,
      script,
      hint: check.hint || 'profile owner supplied check',
      advisory: check.advisory === true,
      source: manifestPath,
    };
  });
}
