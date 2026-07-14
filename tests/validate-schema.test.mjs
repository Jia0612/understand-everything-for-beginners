// validate-schema.mjs 的行为测试。每个测试名是一条大白话承诺。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateAppMap } from '../plugin/skills/explain-my-app/validate-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '../plugin/skills/explain-my-app/validate-schema.mjs');
const EXAMPLE = join(__dirname, '../docs/app-map.example.json');

// 深拷贝示例数据,供各测试改坏
const good = () => JSON.parse(readFileSync(EXAMPLE, 'utf-8'));

test('合格的示例文件必须通过校验', () => {
  const r = validateAppMap(good());
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
});

test('chain 里引用了不存在的零件要报错,错误信息点名是哪个 id', () => {
  const m = good();
  m.chain.push('ghost');
  const r = validateAppMap(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('ghost')), `错误要点名 ghost,实际: ${r.errors}`);
});

test('consequential 零件缺 tradeoff 要报错', () => {
  const m = good();
  m.nodes.fetch.tradeoff = null; // fetch 是 consequential
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('fetch') && e.includes('tradeoff')));
});

test('routine 零件带 tradeoff 要报错(等级不够不该有取舍块)', () => {
  const m = good();
  m.nodes.scheduler.tradeoff = { a: 'x', b: 'y', cost: 'z', when: 'w' }; // scheduler 是 routine
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('scheduler') && e.includes('tradeoff')));
});

test('lane 只能是 fe/be/db,别的值要报错', () => {
  const m = good();
  m.nodes.db.lane = 'cloud';
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('nodes.db.lane')));
});

test('routine 及以上零件的 impact 必须是 2–3 条', () => {
  const m = good();
  m.nodes.scheduler.impact = ['只有一条'];
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('scheduler') && e.includes('impact')));
});

test('code 可以是 null(配置出来的零件),但不能是空数组', () => {
  const m = good();
  assert.equal(m.nodes.dash.code, null, '示例里 dash 本来就是 null,应合法');
  assert.equal(validateAppMap(m).valid, true);
  m.nodes.dash.code = [];
  assert.ok(validateAppMap(m).errors.some(e => e.includes('dash') && e.includes('code')));
});

test('needs/feeds 引用的 id 必须存在', () => {
  const m = good();
  m.nodes.fetch.feeds = ['nonexistent'];
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('fetch') && e.includes('nonexistent')));
});

test('version 不是 1、language 不是 en/zh 都要报错', () => {
  const m = good();
  m.version = 2;
  m.language = 'fr';
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('version')));
  assert.ok(r.errors.some(e => e.includes('language')));
});

test('chain 少于 4 个零件要报错(地图太碎或太空都不合格)', () => {
  const m = good();
  m.chain = m.chain.slice(0, 3);
  // 同时把不在 chain 里的节点删掉,只测长度这一条规则
  for (const id of Object.keys(m.nodes)) if (!m.chain.includes(id)) delete m.nodes[id];
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('chain')));
});

test('命令行:校验坏文件退出码非 0,错误打印到 stderr;好文件退出码 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ue-validate-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"version":1', 'utf-8'); // 残缺 JSON
  const r1 = spawnSync('node', [SCRIPT, bad], { encoding: 'utf-8' });
  assert.notEqual(r1.status, 0);
  assert.ok(r1.stderr.length > 0, '要有可读的错误输出');
  const r2 = spawnSync('node', [SCRIPT, EXAMPLE], { encoding: 'utf-8' });
  assert.equal(r2.status, 0, `示例文件必须通过,stderr: ${r2.stderr}`);
});

// ---- 2026-07-13 用户拍板:讲解要中英双语 ----

// 把示例改造成双语:所有内容字段换成 {en,zh} 对
function bilingual() {
  const m = good();
  m.language = 'both';
  const wrap = (s) => ({ en: `EN: ${s}`, zh: s });
  for (const k of ['name', 'scenario', 'pain', 'now']) m.project[k] = wrap(m.project[k]);
  for (const n of Object.values(m.nodes)) {
    n.name = wrap(n.name); n.role = wrap(n.role); n.how = wrap(n.how);
    n.tourHint = wrap(n.tourHint);
    if (n.fail) n.fail = wrap(n.fail);
    n.impact = n.impact.map(wrap);
    if (n.code) for (const b of n.code) { b.n = wrap(b.n); if (b.risk) b.risk = wrap(b.risk); }
    if (n.tradeoff) for (const k of ['a', 'b', 'cost', 'when']) n.tradeoff[k] = wrap(n.tradeoff[k]);
  }
  return m;
}

test('双语文件(每句话存中英一对,language 是 both)必须通过校验', () => {
  const r = validateAppMap(bilingual());
  assert.deepEqual(r.errors, []);
});

test('双语值缺了一种语言(只有中文没英文)要报错', () => {
  const m = bilingual();
  m.nodes.scheduler.role = { zh: '只有中文' };
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('scheduler') && e.includes('role')), `实际: ${r.errors}`);
});

test('双语值某种语言是空字符串也要报错(空的等于没写)', () => {
  const m = bilingual();
  m.nodes.scheduler.how = { en: '', zh: '中文在' };
  const r = validateAppMap(m);
  assert.ok(r.errors.some(e => e.includes('scheduler') && e.includes('how')));
});
