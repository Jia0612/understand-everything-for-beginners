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
// 三家供应商的"门牌 + 暗号 + 回话格式"。加新供应商 = 在这张表里加一行。
const PROVIDERS = {
  anthropic: {
    // candidates = 模型备胎名单:首选被上游 404(下架/改名)就自动换下一个
    candidates: ['claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-3-5-haiku-20241022'],
    request: (apiKey, model, prompt) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (data) => (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
  },
  openai: {
    candidates: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini'],
    request: (apiKey, model, prompt) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: { model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (data) => String(data.choices?.[0]?.message?.content ?? '').trim(),
  },
  gemini: {
    candidates: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    request: (apiKey, model, prompt) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 700 } },
    }),
    extract: (data) => (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('\n').trim(),
  },
};

export function createExplainer({
  providers,
  apiKey,
  provider,
  model,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
} = {}) {
  // 供应商名单:新式传 providers 数组;旧式单 key 写法照常可用
  const list = providers ?? ((provider !== undefined || apiKey !== undefined)
    ? [{ provider: provider ?? 'anthropic', apiKey, model }]
    : []);
  for (const entry of list) {
    if (!PROVIDERS[entry.provider]) {
      throw new Error(`unknown provider "${entry.provider}" — supported: ${Object.keys(PROVIDERS).join(', ')}`);
    }
  }
  const usable = list.filter((e) => e.apiKey);
  const cache = new Map();

  return async function explain(body) {
    const term = typeof body?.term === 'string' ? body.term.trim() : '';
    if (!term || term.length > 100) {
      return { status: 400, json: { error: 'bad-term', detail: 'term must be 1–100 characters' } };
    }
    if (usable.length === 0) {
      return { status: 503, json: { error: 'no-key', detail: 'set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY before starting the CLI to enable live explanations' } };
    }
    const lang = body.lang === 'en' ? 'en' : 'zh';
    const nodeName = String(body.nodeName ?? '').slice(0, 200);
    const role = String(body.role ?? '').slice(0, 500);
    const cacheKey = `${lang}|${nodeName}|${term}`;
    if (cache.has(cacheKey)) return { status: 200, json: cache.get(cacheKey) };

    // 三段式提示词,对标"阅读器"体验:核心意思 / 具体来说 / 打个比方
    const prompt = lang === 'zh'
      ? `你在给一位完全不懂技术的人解释软件地图里的一个词。当前部分:「${nodeName}」(${role})。\n请用大白话解释「${term}」在这个上下文里的意思,按下面三段输出(纯文本,不用任何markdown符号,不要客套开场):\n核心意思:(一句话说透)\n具体来说:(两三句展开,任何术语当场用括号解释)\n打个比方:(一个贴合本场景、经得起追问的生活类比;实在没有贴切的就写"这个概念很直白,不需要比方")`
      : `You are explaining a term on a software map to someone with zero technical background. Current part: "${nodeName}" (${role}).\nExplain what "${term}" means in this context, in exactly three labeled parts (plain text, no markdown, no preamble):\n核心意思 Core idea: (one sentence that nails it)\n具体来说 Concretely: (2–3 sentences, define any jargon in parentheses)\n打个比方 Analogy: (one everyday comparison that fits THIS context and survives a follow-up; if none fits, say the concept is plain enough not to need one)`;

    // 两级备胎:模型名单内轮换(404/400 多为模型下架),供应商之间再轮换
    const failures = [];
    for (const entry of usable) {
      const spec = PROVIDERS[entry.provider];
      const models = entry.model ? [entry.model] : spec.candidates;
      for (const m of models) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const { url, headers, body: reqBody } = spec.request(entry.apiKey, m, prompt);
          const resp = await fetchImpl(url, {
            method: 'POST', signal: controller.signal, headers, body: JSON.stringify(reqBody),
          });
          if (resp.ok) {
            const data = await resp.json();
            const text = spec.extract(data);
            if (text) {
              const json = { explanation: text, provider: entry.provider };
              cache.set(cacheKey, json);
              return { status: 200, json };
            }
            failures.push(`${entry.provider}: empty response (${m})`);
          } else {
            failures.push(`${entry.provider}: status ${resp.status} (${m})`);
            // 401/403 = key 本身不对,换模型也没用,直接换下一家
            if (resp.status === 401 || resp.status === 403) break;
          }
        } catch (e) {
          failures.push(`${entry.provider}: ${e.name === 'AbortError' ? 'timeout' : 'network error'} (${m})`);
        } finally {
          clearTimeout(timer);
        }
      }
    }
    return { status: 502, json: { error: 'provider', detail: failures.join('; ') } };
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
