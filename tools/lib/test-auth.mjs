'use strict';
// 测试助手：控制台现在每启动一份令牌（Q1=A），没有关认证的开关（Q4=1）。
// 进程内测试直接用 server.turnstileToken 注入请求头，不读文件、不开关认证。
export function installTokenFetch(token) {
  if (!token) throw new Error('installTokenFetch 需要令牌：先 createConsoleServer 再调用');
  const original = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => {
    const headers = Object.assign({}, init.headers || {});
    if (!headers['x-turnstile-token']) headers['x-turnstile-token'] = token;
    return original(url, Object.assign({}, init, { headers }));
  };
  return () => { globalThis.fetch = original; };
}
