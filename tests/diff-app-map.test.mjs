// 变化对比(diff)的行为测试:重新生成地图后,准确圈出「哪变了、哪被波及」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { computeDiff } from '../plugin/skills/explain-my-app/diff-app-map.mjs';
import { validateAppMap } from '../plugin/skills/explain-my-app/validate-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '../plugin/skills/explain-my-app/diff-app-map.mjs');
const EXAMPLE = join(__dirname, '../docs/app-map.example.json');
const load = () => JSON.parse(readFileSync(EXAMPLE, 'utf-8'));

test('内容一字未变:changed 和 affected 都为空', () => {
  const d = computeDiff(load(), load());
  assert.deepEqual(d, { changed: [], affected: [] });
});

test('某零件的讲解或代码变了:它进 changed,它的下游(顺着 feeds 一路传)进 affected', () => {
  const oldMap = load(), newMap = load();
  newMap.nodes.fetch.how = '换了一种全新的抓取方式。';
  const d = computeDiff(oldMap, newMap);
  assert.deepEqual(d.changed, ['fetch']);
  // 示例链:scheduler→fetch→normalize→redis→db→dash,fetch 的下游是后四个
  assert.deepEqual(d.affected.sort(), ['dash', 'db', 'normalize', 'redis'].sort());
});

test('新增的零件算 changed;变了的零件不重复出现在 affected 里', () => {
  const oldMap = load(), newMap = load();
  newMap.nodes.redis.how = '限速规则改了。';        // redis 变了
  newMap.nodes.alert = {                            // 新增一个零件,挂在 db 下游
    lane: 'be', tool: 'Slack webhook', grade: 'routine',
    needs: ['db'], feeds: [], name: '报警器', role: '数据断更时发消息提醒。',
    impact: ['断更当天就知道', '不用人工盯着'], how: '每小时查一次库,数据缺了就发 Slack。',
    fail: '报警器自己坏了不会有人提醒——这是它的盲区。', code: null, tradeoff: null, tourHint: '',
  };
  newMap.chain.push('alert');
  newMap.nodes.db.feeds = [...newMap.nodes.db.feeds, 'alert'];
  const d = computeDiff(oldMap, newMap);
  assert.ok(d.changed.includes('redis') && d.changed.includes('alert'));
  // db 的 feeds 变了(多了 alert),所以 db 也算 changed——但绝不能同时出现在 affected
  for (const id of d.changed) assert.ok(!d.affected.includes(id), `${id} 不能既 changed 又 affected`);
});

test('第一次生成(没有旧地图):diff 为空,不乱标', () => {
  assert.deepEqual(computeDiff(null, load()), { changed: [], affected: [] });
});

test('命令行:把对比结果写回新地图的 diff 字段,写完的文件仍然过校验', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ue-diff-'));
  const oldP = join(dir, 'old.json'), newP = join(dir, 'new.json');
  const oldMap = load(), newMap = load();
  newMap.nodes.scheduler.role = '改成每 10 分钟跑一次。';
  writeFileSync(oldP, JSON.stringify(oldMap));
  writeFileSync(newP, JSON.stringify(newMap));
  const r = spawnSync('node', [SCRIPT, oldP, newP], { encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  const updated = JSON.parse(readFileSync(newP, 'utf-8'));
  assert.deepEqual(updated.diff.changed, ['scheduler']);
  assert.ok(updated.diff.affected.length > 0);
  assert.equal(validateAppMap(updated).valid, true, '写回后必须仍是合格文件');
});
