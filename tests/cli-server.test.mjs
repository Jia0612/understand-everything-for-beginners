// CLI 本地服务器的行为测试。重点:文件路由正确 + 越界读文件必须被拦住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { createHandler } from '../cli/server.mjs';

// 起一个真实的本地服务器,发真实请求,返回 {status, body, type}
function setup() {
  const dist = mkdtempSync(join(tmpdir(), 'ue-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>UE</title>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  const proj = mkdtempSync(join(tmpdir(), 'ue-proj-'));
  writeFileSync(join(proj, 'secret.txt'), 'TOP-SECRET');
  mkdirSync(join(proj, '.ue'));
  writeFileSync(join(proj, '.ue', 'app-map.json'), '{"version":1}');

  const server = http.createServer(createHandler(dist, join(proj, '.ue', 'app-map.json')));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const get = (path) => new Promise((res) => {
        http.get({ host: '127.0.0.1', port, path }, (r) => {
          let body = '';
          r.on('data', (c) => { body += c; });
          r.on('end', () => res({ status: r.statusCode, body, type: r.headers['content-type'] }));
        });
      });
      resolve({ get, close: () => server.close(), dist });
    });
  });
}

test('访问 / 返回仪表盘页面,访问打包资源返回 JS', async () => {
  const s = await setup();
  const home = await s.get('/');
  assert.equal(home.status, 200);
  assert.ok(home.body.includes('UE'));
  assert.ok(home.type.includes('text/html'));
  const js = await s.get('/assets/app.js');
  assert.equal(js.status, 200);
  assert.ok(js.type.includes('javascript'));
  s.close();
});

test('访问 /app-map.json 返回项目里的地图文件', async () => {
  const s = await setup();
  const r = await s.get('/app-map.json');
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('"version"'));
  assert.ok(r.type.includes('json'));
  s.close();
});

test('项目里没有地图文件时,/app-map.json 返回 404(仪表盘会自动退回示例)', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'ue-dist2-'));
  writeFileSync(join(dist, 'index.html'), 'x');
  const server = http.createServer(createHandler(dist, null));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const status = await new Promise((res) => {
    http.get({ host: '127.0.0.1', port, path: '/app-map.json' }, (r) => res(r.statusCode));
  });
  assert.equal(status, 404);
  server.close();
});

test('用 ../ 越界读服务器外的文件必须被拦住(404,而不是把文件吐出去)', async () => {
  const s = await setup();
  for (const evil of ['/../secret.txt', '/..%2fsecret.txt', '/assets/../../secret.txt']) {
    const r = await s.get(evil);
    assert.notEqual(r.status, 200, `${evil} 不该成功`);
    assert.ok(!r.body.includes('TOP-SECRET'), `${evil} 泄漏了文件内容`);
  }
  s.close();
});

// ---- 2026-07-27 第三轮:/api/explain 本地代理(key 只走环境变量,永不进浏览器) ----
import { createExplainer } from '../cli/server.mjs';

function postExplain(handler, body) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const req = http.request(
        { host: '127.0.0.1', port: server.address().port, path: '/api/explain', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { server.close(); resolve({ status: r.statusCode, json: JSON.parse(b) }); }); },
      );
      req.end(JSON.stringify(body));
    });
  });
}

test('/api/explain:没配 key 时返回明确的「未配置」,不装死也不泄漏任何东西', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'ue-dist3-'));
  writeFileSync(join(dist, 'index.html'), 'x');
  const handler = createHandler(dist, null, createExplainer({ apiKey: undefined }));
  const r = await postExplain(handler, { term: 'API', lang: 'zh' });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'no-key');
});

test('/api/explain:有 key 时返回解释;同一个问题第二次命中缓存,不再花钱调供应商', async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '假解释:就是两个程序说话的方式。' }] }) }; };
  const dist = mkdtempSync(join(tmpdir(), 'ue-dist4-'));
  writeFileSync(join(dist, 'index.html'), 'x');
  const handler = createHandler(dist, null, createExplainer({ apiKey: 'test-key', fetchImpl: fakeFetch }));
  const body = { term: 'API', nodeName: '读懂代码', role: '读代码', lang: 'zh' };
  const r1 = await postExplain(handler, body);
  assert.equal(r1.status, 200);
  assert.ok(r1.json.explanation.includes('假解释'));
  const r2 = await postExplain(handler, body);
  assert.equal(r2.status, 200);
  assert.equal(calls, 1, '相同问题第二次必须走缓存,供应商只被调一次');
});

test('/api/explain:空词、超过 100 字的词都返回 400,不浪费一次调用', async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ content: [] }) }; };
  const dist = mkdtempSync(join(tmpdir(), 'ue-dist5-'));
  writeFileSync(join(dist, 'index.html'), 'x');
  const handler = createHandler(dist, null, createExplainer({ apiKey: 'test-key', fetchImpl: fakeFetch }));
  assert.equal((await postExplain(handler, { term: '', lang: 'zh' })).status, 400);
  assert.equal((await postExplain(handler, { term: 'x'.repeat(101), lang: 'zh' })).status, 400);
  assert.equal(calls, 0, '非法输入不许碰供应商');
});
