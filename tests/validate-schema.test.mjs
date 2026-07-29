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
const EXAMPLE = join(__dirname, './fixtures/app-map.v1-en.json');

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

test('version 不是 1/2、language 不是 en/zh 都要报错', () => {
  const m = good();
  m.version = 3;
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

// ---- 2026-07-13 用户反馈:核心代码要逐行费曼翻译 ----

test('代码块可以带逐行翻译(lines),行数必须和代码行数一一对应', () => {
  const m = good();
  const block = m.nodes.scheduler.code[0]; // 4 行 serverless.yml
  const n = block.c.split('\n').length;
  block.lines = Array.from({ length: n }, (_, i) => `第 ${i + 1} 行的人话解释`);
  assert.equal(validateAppMap(m).valid, true, JSON.stringify(validateAppMap(m).errors));
  block.lines = ['只有一行'];  // 行数对不上
  assert.ok(validateAppMap(m).errors.some(e => e.includes('scheduler') && e.includes('lines')));
});

test('逐行翻译支持双语对,允许个别行留空(没什么好说的行)', () => {
  const m = good();
  const block = m.nodes.scheduler.code[0];
  const n = block.c.split('\n').length;
  block.lines = Array.from({ length: n }, () => ({ en: 'plain', zh: '人话' }));
  block.lines[n - 1] = '';
  assert.equal(validateAppMap(m).valid, true, JSON.stringify(validateAppMap(m).errors));
});

// ---- 2026-07-27 用户拍板:内容模型 v2(contents / before / after / impact 改义为成本与风险) ----

// 把示例升级成一份最小 v2 地图
function v2map() {
  const m = good();
  m.version = 2;
  for (const n of Object.values(m.nodes)) {
    // v2 里 impact 只讲成本与风险,0–2 条
    if (n.grade !== 'trivial') n.impact = n.impact.slice(0, 2);
  }
  return m;
}

test('version 2 的地图合法;v1 旧地图规则原样不变', () => {
  const r = validateAppMap(v2map());
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  assert.equal(validateAppMap(good()).valid, true, 'v1 必须照旧合法');
});

test('v2 的 impact(成本与风险)最多 2 条,0 条也合法;3 条要报错', () => {
  const m = v2map();
  m.nodes.scheduler.impact = [];
  assert.equal(validateAppMap(m).valid, true, '0 条应合法');
  m.nodes.scheduler.impact = ['成本一', '风险二', '第三条'];
  assert.ok(validateAppMap(m).errors.some(e => e.includes('scheduler') && e.includes('impact')));
});

test('contents(这一站里装着什么)可选;有则 1–8 条,9 条报错', () => {
  const m = v2map();
  m.nodes.fetch.contents = ['规则一', '规则二', '规则三'];
  assert.equal(validateAppMap(m).valid, true, JSON.stringify(validateAppMap(m).errors));
  m.nodes.fetch.contents = Array.from({ length: 9 }, (_, i) => `条目 ${i}`);
  assert.ok(validateAppMap(m).errors.some(e => e.includes('fetch') && e.includes('contents')));
  m.nodes.fetch.contents = [];
  assert.ok(validateAppMap(m).errors.some(e => e.includes('fetch') && e.includes('contents')), '空数组也不行');
});

test('before/after 可选;每边 1–3 条,4 条报错;支持双语对', () => {
  const m = v2map();
  m.nodes.db.before = [{ en: 'Manual exports', zh: '手动导表' }];
  m.nodes.db.after = ['自动入库', '报表随时可查'];
  assert.equal(validateAppMap(m).valid, true, JSON.stringify(validateAppMap(m).errors));
  m.nodes.db.before = ['一', '二', '三', '四'];
  assert.ok(validateAppMap(m).errors.some(e => e.includes('db') && e.includes('before')));
});

// ---- 2026-07-27 第二轮:词典 + 原文对照升级(方案 A) ----

test('词典(glossary):全局和节点级都合法;词条必须有 short 解释,缺了报错', () => {
  const m = good();
  m.version = 2;
  for (const n of Object.values(m.nodes)) if (n.grade !== 'trivial') n.impact = n.impact.slice(0, 2);
  m.glossary = { 'API': { short: { en: 'An agreed way for two programs to talk.', zh: '两个程序之间约定好的对话方式。' } } };
  m.nodes.redis.glossary = { '指纹': { short: '一段数据的身份证号', detail: '同样的数据永远算出同一个指纹,一比对就知道见没见过。' } };
  const r = validateAppMap(m);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  m.glossary['坏词条'] = { detail: '只有细节没有 short' };
  assert.ok(validateAppMap(m).errors.some(e => e.includes('glossary') && e.includes('坏词条')));
});

test('v2 原文对照块:可带 title(这是什么)和 src(出自哪);代码超过 15 行要报错', () => {
  const m = good();
  m.version = 2;
  for (const n of Object.values(m.nodes)) if (n.grade !== 'trivial') n.impact = n.impact.slice(0, 2);
  const block = m.nodes.scheduler.code[0];
  block.title = { en: 'The timer config, complete', zh: '定时器配置完整原文' };
  block.src = 'serverless.yml';
  assert.equal(validateAppMap(m).valid, true, JSON.stringify(validateAppMap(m).errors));
  block.c = Array.from({ length: 16 }, (_, i) => `line ${i}`).join('\n');
  assert.ok(validateAppMap(m).errors.some(e => e.includes('scheduler') && e.includes('15')));
});
