/**
 * 本地小服务器:把打包好的仪表盘 + 项目里的地图文件端给浏览器。
 * 零依赖,只用 Node 自带的模块。
 * 安全底线:只允许读 dist 文件夹里的东西,任何 ../ 越界一律 404。
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, extname, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * createExplainer({ apiKey, model, fetchImpl, timeoutMs }) — 实时解释器。
 * key 只从这里(启动 CLI 的终端环境变量)进来,绝不进浏览器、不写盘、不打日志。
 * 相同问题在内存里缓存,同一个词第二次点不再花钱。
 * 返回 async (body) => { status, json },由 /api/explain 路由调用。
 */
export function createExplainer({
  apiKey,
  model = 'claude-haiku-4-5-20251001',
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
} = {}) {
  const cache = new Map();

  return async function explain(body) {
    const term = typeof body?.term === 'string' ? body.term.trim() : '';
    if (!term || term.length > 100) {
      return { status: 400, json: { error: 'bad-term', detail: 'term must be 1–100 characters' } };
    }
    if (!apiKey) {
      return { status: 503, json: { error: 'no-key', detail: 'start the CLI with ANTHROPIC_API_KEY set to enable live explanations' } };
    }
    const lang = body.lang === 'en' ? 'en' : 'zh';
    const nodeName = String(body.nodeName ?? '').slice(0, 200);
    const role = String(body.role ?? '').slice(0, 500);
    const cacheKey = `${lang}|${nodeName}|${term}`;
    if (cache.has(cacheKey)) return { status: 200, json: cache.get(cacheKey) };

    const prompt = lang === 'zh'
      ? `你在给一位完全不懂技术的人解释软件地图里的一个词。当前部分:「${nodeName}」(${role})。请用大白话解释「${term}」在这个上下文里的意思,最多三句话,不用任何未解释的术语,不要客套开场。`
      : `You are explaining a term on a software map to someone with zero technical background. Current part: "${nodeName}" (${role}). In plain language, explain what "${term}" means in this context — at most three sentences, no unexplained jargon, no preamble.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) {
        return { status: 502, json: { error: 'provider', detail: `upstream status ${resp.status}` } };
      }
      const data = await resp.json();
      const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!text) return { status: 502, json: { error: 'provider', detail: 'empty response' } };
      const json = { explanation: text };
      cache.set(cacheKey, json);
      return { status: 200, json };
    } catch (e) {
      return { status: 502, json: { error: 'provider', detail: e.name === 'AbortError' ? 'timeout' : 'network error' } };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * createHandler(distDir, mapPath, explainer?) — 返回一个 http 请求处理函数。
 * distDir: 仪表盘打包产物目录;mapPath: 项目地图文件的绝对路径(可为 null);
 * explainer: createExplainer 的返回值(可为 null,则 /api/explain 报「未配置」)。
 */
export function createHandler(distDir, mapPath, explainer = null) {
  const distRoot = resolve(distDir);
  const doExplain = explainer ?? createExplainer({});

  return function handle(req, res) {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);

    // 实时解释:浏览器把选中的词发到这里,key 永远只在本进程里
    if (url === '/api/explain' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 10_000) req.destroy(); });
      req.on('end', async () => {
        let body = {};
        try { body = JSON.parse(raw || '{}'); } catch { /* 按空对象处理,会被 bad-term 拦下 */ }
        const { status, json } = await doExplain(body);
        res.writeHead(status, { 'Content-Type': MIME['.json'] });
        res.end(JSON.stringify(json));
      });
      return;
    }

    // 项目地图:单独路由,不走静态目录
    if (url === '/app-map.json') {
      if (mapPath && existsSync(mapPath)) {
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        createReadStream(mapPath).pipe(res);
      } else {
        res.writeHead(404); res.end('no app-map.json in this project');
      }
      return;
    }

    // 静态文件:归一化后必须仍在 dist 里面,否则就是越界攻击,404
    const rel = url === '/' ? 'index.html' : url.slice(1);
    const abs = resolve(distRoot, normalize(rel));
    if (abs !== distRoot && !abs.startsWith(distRoot + sep)) {
      res.writeHead(404); res.end('not found');
      return;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      // 未知路径回落到 index.html(单页应用的惯例),但绝不越界
      const fallback = join(distRoot, 'index.html');
      if (existsSync(fallback)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        createReadStream(fallback).pipe(res);
      } else {
        res.writeHead(404); res.end('not found');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream' });
    createReadStream(abs).pipe(res);
  };
}
