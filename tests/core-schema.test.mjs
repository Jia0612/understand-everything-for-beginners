// packages/core(zod 正式规范包)的行为测试。每个测试名是一条大白话承诺。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAppMap, generateWithRetry } from '../packages/core/src/index.js';
import { validateAppMap as pluginValidate } from '../plugin/skills/explain-my-app/validate-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const good = () => JSON.parse(readFileSync(join(__dirname, '../docs/app-map.example.json'), 'utf-8'));
const goodBilingual = () => JSON.parse(readFileSync(join(__dirname, '../docs/app-map.m1-codebase-to-course.json'), 'utf-8'));

test('zod 版校验:单语示例和双语示例都必须通过', () => {
  assert.deepEqual(validateAppMap(good()).errors, []);
  assert.deepEqual(validateAppMap(goodBilingual()).errors, []);
});

test('zod 版校验:报错要点名具体位置(哪个零件的哪个字段)', () => {
  const m = good();
  m.nodes.fetch.tradeoff = null; // fetch 是 consequential,必须有取舍
  const r = validateAppMap(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('fetch') && e.includes('tradeoff')), `实际: ${r.errors}`);
});

test('新旧两套校验器对同一批文件的判决必须一致(合格都放行,坏的都拦下)', () => {
  // 一批有代表性的样本:2 份合格 + 8 种典型改坏
  const samples = [good(), goodBilingual()];
  const breakers = [
    m => { m.chain.push('ghost'); },                                  // chain 引用不存在的零件
    m => { m.nodes.fetch.tradeoff = null; },                          // consequential 缺取舍
    m => { m.nodes.scheduler.tradeoff = { a: 'x', b: 'y', cost: 'z', when: 'w' }; }, // routine 带取舍
    m => { m.nodes.db.lane = 'cloud'; },                              // 非法泳道
    m => { m.nodes.scheduler.impact = ['只有一条']; },                 // impact 数量不对
    m => { m.nodes.dash.code = []; },                                 // code 空数组
    m => { m.nodes.fetch.feeds = ['nonexistent']; },                  // feeds 指向不存在的零件
    m => { m.version = 2; m.language = 'fr'; },                       // 版本/语言非法
  ];
  for (const breaker of breakers) {
    const m = good();
    breaker(m);
    samples.push(m);
  }
  samples.forEach((m, i) => {
    const a = validateAppMap(m).valid;
    const b = pluginValidate(m).valid;
    assert.equal(a, b, `样本 ${i}:zod 版判 ${a},插件版判 ${b}——两套检查失去一致`);
  });
});

test('生成重试流程:第一次坏、第二次修好 → 接受;并把第一次的错误喂给第二次', async () => {
  let seenErrors = null;
  let calls = 0;
  const result = await generateWithRetry(async (previousErrors) => {
    calls++;
    if (calls === 1) { const m = good(); m.chain.push('ghost'); return m; } // 第一次:坏的
    seenErrors = previousErrors;                                           // 第二次:能看到错误
    return good();                                                          // 修好了
  });
  assert.equal(calls, 2);
  assert.ok(Array.isArray(seenErrors) && seenErrors.some(e => e.includes('ghost')), '第二次生成必须拿到第一次的错误清单');
  assert.equal(result.project.name, good().project.name);
});

test('生成重试流程:两次都坏 → 明确拒绝,错误可读,绝不返回坏数据', async () => {
  await assert.rejects(
    generateWithRetry(async () => { const m = good(); delete m.nodes; return m; }),
    (err) => {
      assert.ok(err.message.includes('nodes'), `错误信息要可读且指出问题,实际: ${err.message}`);
      return true;
    },
  );
});
