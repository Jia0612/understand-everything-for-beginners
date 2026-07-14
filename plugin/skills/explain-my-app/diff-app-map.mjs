#!/usr/bin/env node
/**
 * diff-app-map.mjs — 对比新旧两份地图,圈出「哪变了、哪被波及」。
 * changed  = 内容有实质变化的零件 + 新增的零件(画布上标红)
 * affected = changed 零件的全部下游(顺着 feeds 一路传),但自己没变(标琥珀)
 * 第一次生成(没有旧地图)时 diff 为空。零依赖。
 *
 * 用法: node diff-app-map.mjs <旧 app-map.json> <新 app-map.json>
 *       对比结果直接写回新文件的 diff 字段。旧文件不存在时写空 diff。
 */

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 参与「变没变」判断的字段——讲解内容和结构;diff 自己和 tourHint 这种导览花絮不算
const COMPARED_FIELDS = [
  'lane', 'tool', 'grade', 'needs', 'feeds',
  'name', 'role', 'impact', 'how', 'fail', 'code', 'tradeoff',
];

// 稳定序列化:对象键排序后再比,键顺序不同不算变化
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

function nodeFingerprint(n) {
  return stable(COMPARED_FIELDS.map((k) => n?.[k] ?? null));
}

/**
 * computeDiff(oldMap, newMap) → { changed: [], affected: [] }
 * 顺序稳定:都按新地图 chain 的次序排。
 */
export function computeDiff(oldMap, newMap) {
  if (!oldMap || !oldMap.nodes) return { changed: [], affected: [] };

  const changed = new Set();
  for (const [id, n] of Object.entries(newMap.nodes)) {
    const prev = oldMap.nodes[id];
    if (!prev || nodeFingerprint(prev) !== nodeFingerprint(n)) changed.add(id);
  }

  // 波及面:从每个 changed 出发,顺着 feeds 一路往下收集
  const affected = new Set();
  const walk = (id) => {
    for (const next of newMap.nodes[id]?.feeds ?? []) {
      if (!newMap.nodes[next] || affected.has(next)) continue;
      affected.add(next);
      walk(next);
    }
  };
  for (const id of changed) walk(id);
  for (const id of changed) affected.delete(id); // 变了的只标 changed,不重复标

  const order = (set) => newMap.chain.filter((id) => set.has(id))
    .concat([...set].filter((id) => !newMap.chain.includes(id)));
  return { changed: order(changed), affected: order(affected) };
}

// --- CLI 入口:被测试 import 时不执行 ---
function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch { return false; }
}

if (isCliEntry()) {
  const [, , oldPath, newPath] = process.argv;
  if (!newPath) {
    process.stderr.write('用法: node diff-app-map.mjs <旧 app-map.json> <新 app-map.json>\n');
    process.exit(1);
  }
  const newMap = JSON.parse(readFileSync(newPath, 'utf-8'));
  const oldMap = oldPath && existsSync(oldPath)
    ? JSON.parse(readFileSync(oldPath, 'utf-8'))
    : null;
  newMap.diff = computeDiff(oldMap, newMap);
  writeFileSync(newPath, JSON.stringify(newMap, null, 2) + '\n', 'utf-8');
  process.stderr.write(`diff-app-map: changed=[${newMap.diff.changed}] affected=[${newMap.diff.affected}]\n`);
}
