// 仪表盘逻辑层的行为测试(排版公式 / 双语取值 / 坏文件回退)。界面长相由人眼验收,不在此列。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { L } from '../packages/dashboard/src/lib/bilingual.mjs';
import { nodePos, edgePath, canvasWidth, NODE_W, LANE_Y } from '../packages/dashboard/src/lib/layout.mjs';
import { chooseData } from '../packages/dashboard/src/lib/chooseData.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demo = () => JSON.parse(readFileSync(join(__dirname, '../docs/app-map.example.json'), 'utf-8'));

// 造一张 n 个零件的合成地图(轮流分配三条泳道),用于测排版
function syntheticMap(n) {
  const chain = Array.from({ length: n }, (_, i) => `p${i}`);
  const nodes = {};
  chain.forEach((id, i) => {
    nodes[id] = { lane: ['fe', 'be', 'db'][i % 3] };
  });
  return { chain, nodes };
}

test('零件位置由数据流顺序和泳道决定:第 i 个零件的 x 随顺序递增,y 只看泳道', () => {
  const m = syntheticMap(5);
  const p0 = nodePos(m, 'p0');
  const p1 = nodePos(m, 'p1');
  assert.equal(p0.x, 50);
  assert.equal(p1.x, 50 + 210);
  assert.equal(p0.y, LANE_Y.fe);
  assert.equal(p1.y, LANE_Y.be);
  assert.equal(nodePos(m, 'p2').y, LANE_Y.db);
});

test('同泳道连线是直线,跨泳道连线是弧线', () => {
  const flat = edgePath({ x: 50, y: 100 }, { x: 260, y: 100 });
  assert.ok(flat.includes('L') && !flat.includes('C'), '同泳道应是直线(L 命令)');
  const curve = edgePath({ x: 50, y: 100 }, { x: 260, y: 300 });
  assert.ok(curve.includes('C'), '跨泳道应是弧线(C 命令)');
});

test('4 个和 12 个零件的地图:位置各不相同、从左到右排开、画布宽度够放', () => {
  for (const n of [4, 12]) {
    const m = syntheticMap(n);
    const xs = m.chain.map((id) => nodePos(m, id).x);
    assert.equal(new Set(xs).size, n, `${n} 个零件的 x 必须各不相同`);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'x 必须递增');
    assert.ok(canvasWidth(n) >= xs[n - 1] + NODE_W, '画布必须装得下最后一个零件');
  }
});

test('L():双语值按当前语言取,缺了就退回另一种语言,普通字符串原样返回', () => {
  assert.equal(L({ en: 'Hello', zh: '你好' }, 'zh'), '你好');
  assert.equal(L({ en: 'Hello', zh: '你好' }, 'en'), 'Hello');
  assert.equal(L({ en: 'Only English' }, 'zh'), 'Only English');
  assert.equal(L('plain', 'zh'), 'plain');
  assert.equal(L(null, 'en'), '');
});

test('外部地图文件合格就用它;不合格就退回示例项目,并留下可读原因', () => {
  const d = demo();
  const ok = chooseData(d, demo());
  assert.equal(ok.source, 'external');

  const broken = demo();
  broken.chain.push('ghost');
  const fallback = chooseData(broken, demo());
  assert.equal(fallback.source, 'demo');
  assert.ok(fallback.rejectedBecause.some((e) => e.includes('ghost')), '要说清外部文件为什么被拒');

  const none = chooseData(null, demo());
  assert.equal(none.source, 'demo');
  assert.deepEqual(none.rejectedBecause, []);
});
