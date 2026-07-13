#!/usr/bin/env node
/**
 * validate-schema.mjs — app-map.json 的守门员。
 * 结构不合格的文件不放行,错误信息可读、点名具体位置,供生成器修正后重试。
 * 零依赖(M2 会在 packages/core 里补一份 zod 版;本文件保证插件独立可用)。
 *
 * 用法: node validate-schema.mjs <app-map.json>
 * 退出码: 0 = 合格;1 = 不合格(错误逐条打印到 stderr)
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LANES = new Set(['fe', 'be', 'db']);
const GRADES = new Set(['trivial', 'routine', 'consequential']);
const CHAIN_MIN = 4;
const CHAIN_MAX = 15;

const isStr = (v) => typeof v === 'string';
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * 校验一个已解析的 app-map 对象。
 * 返回 { valid, errors: string[] } —— errors 为空即合格。
 */
export function validateAppMap(m) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    return { valid: false, errors: ['root: must be a JSON object'] };
  }

  // --- 顶层字段 ---
  if (m.version !== 1) err('version', `must be 1, got ${JSON.stringify(m.version)}`);
  if (m.language !== 'en' && m.language !== 'zh') {
    err('language', `must be "en" or "zh", got ${JSON.stringify(m.language)}`);
  }

  if (!m.project || typeof m.project !== 'object') {
    err('project', 'missing or not an object');
  } else {
    if (!isNonEmptyStr(m.project.name)) err('project.name', 'must be a non-empty string');
    // scenario/pain 允许为空(宁缺勿编),但必须是字符串
    for (const k of ['scenario', 'pain', 'now']) {
      if (!isStr(m.project[k])) err(`project.${k}`, 'must be a string (may be empty)');
    }
  }

  const nodes = (m.nodes && typeof m.nodes === 'object' && !Array.isArray(m.nodes)) ? m.nodes : null;
  if (!nodes) err('nodes', 'missing or not an object');
  const nodeIds = nodes ? Object.keys(nodes) : [];

  // --- chain ---
  if (!Array.isArray(m.chain)) {
    err('chain', 'missing or not an array');
  } else {
    if (m.chain.length < CHAIN_MIN || m.chain.length > CHAIN_MAX) {
      err('chain', `must have ${CHAIN_MIN}–${CHAIN_MAX} parts, got ${m.chain.length}`);
    }
    if (new Set(m.chain).size !== m.chain.length) err('chain', 'contains duplicate ids');
    for (const id of m.chain) {
      if (nodes && !nodes[id]) err('chain', `references unknown node "${id}"`);
    }
    if (nodes) {
      for (const id of nodeIds) {
        if (!m.chain.includes(id)) {
          err(`nodes.${id}`, 'not in chain — every node must sit on the data flow');
        }
      }
    }
  }

  // --- 每个节点 ---
  if (nodes) {
    for (const [id, n] of Object.entries(nodes)) {
      const p = `nodes.${id}`;
      if (!n || typeof n !== 'object') { err(p, 'must be an object'); continue; }

      if (!LANES.has(n.lane)) err(`${p}.lane`, `must be "fe" | "be" | "db", got ${JSON.stringify(n.lane)}`);
      if (!isNonEmptyStr(n.tool)) err(`${p}.tool`, 'must be a non-empty string');
      if (!GRADES.has(n.grade)) err(`${p}.grade`, `must be "trivial" | "routine" | "consequential", got ${JSON.stringify(n.grade)}`);
      if (!isNonEmptyStr(n.name)) err(`${p}.name`, 'must be a non-empty string');
      if (!isNonEmptyStr(n.role)) err(`${p}.role`, 'must be a non-empty string');
      if (!isNonEmptyStr(n.how)) err(`${p}.how`, 'must be a non-empty string');
      if (!isStr(n.tourHint)) err(`${p}.tourHint`, 'must be a string');

      // needs/feeds 必须指向真实存在的节点
      for (const k of ['needs', 'feeds']) {
        if (!Array.isArray(n[k])) { err(`${p}.${k}`, 'must be an array'); continue; }
        for (const ref of n[k]) {
          if (!nodes[ref]) err(`${p}.${k}`, `references unknown node "${ref}"`);
        }
      }

      // grade 决定哪些内容必须有/不能有(等级管内容,防止生成器偷懒或越级)
      if (!Array.isArray(n.impact)) {
        err(`${p}.impact`, 'must be an array');
      } else if (n.grade === 'trivial') {
        if (n.impact.length !== 0) err(`${p}.impact`, 'trivial parts carry no impact list');
      } else if (GRADES.has(n.grade)) {
        if (n.impact.length < 2 || n.impact.length > 3) {
          err(`${p}.impact`, `must have 2–3 items for ${n.grade} parts, got ${n.impact.length}`);
        }
        if (!n.impact.every(isNonEmptyStr)) err(`${p}.impact`, 'every item must be a non-empty string');
      }

      if (n.grade === 'trivial') {
        if (!isStr(n.fail ?? '')) err(`${p}.fail`, 'must be a string');
      } else if (GRADES.has(n.grade) && !isNonEmptyStr(n.fail)) {
        err(`${p}.fail`, `required for ${n.grade} parts`);
      }

      if (n.grade === 'consequential') {
        const t = n.tradeoff;
        if (!t || typeof t !== 'object') {
          err(`${p}.tradeoff`, 'required for consequential parts (chose A over B, cost, when to switch)');
        } else {
          for (const k of ['a', 'b', 'cost', 'when']) {
            if (!isNonEmptyStr(t[k])) err(`${p}.tradeoff.${k}`, 'must be a non-empty string');
          }
        }
      } else if (GRADES.has(n.grade) && n.tradeoff !== null && n.tradeoff !== undefined) {
        err(`${p}.tradeoff`, `must be null unless grade is consequential (got grade "${n.grade}")`);
      }

      // code: null(配置出来的零件)或非空数组
      if (n.code !== null) {
        if (!Array.isArray(n.code) || n.code.length === 0) {
          err(`${p}.code`, 'must be null (configured, not coded) or a non-empty array of blocks');
        } else {
          n.code.forEach((b, i) => {
            if (!b || typeof b !== 'object') { err(`${p}.code[${i}]`, 'must be an object'); return; }
            if (!isNonEmptyStr(b.c)) err(`${p}.code[${i}].c`, 'must contain real code lines');
            if (!isNonEmptyStr(b.n)) err(`${p}.code[${i}].n`, 'must contain one plain-language note');
            if (b.risk !== null && b.risk !== undefined && !isNonEmptyStr(b.risk)) {
              err(`${p}.code[${i}].risk`, 'must be null or a non-empty string');
            }
          });
        }
      }
    }
  }

  // --- diff ---
  if (!m.diff || typeof m.diff !== 'object') {
    err('diff', 'missing or not an object');
  } else {
    for (const k of ['changed', 'affected']) {
      if (!Array.isArray(m.diff[k])) err(`diff.${k}`, 'must be an array');
      else if (nodes) {
        for (const ref of m.diff[k]) {
          if (!nodes[ref]) err(`diff.${k}`, `references unknown node "${ref}"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- CLI 入口:被测试 import 时不执行 ---
function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch { return false; }
}

if (isCliEntry()) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('用法: node validate-schema.mjs <app-map.json>\n');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (e) {
    process.stderr.write(`validate-schema: ${file} is not readable JSON — ${e.message}\n`);
    process.exit(1);
  }
  const { valid, errors } = validateAppMap(parsed);
  if (!valid) {
    process.stderr.write(`validate-schema: ${file} failed ${errors.length} check(s):\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }
  process.stderr.write(`validate-schema: ${file} OK\n`);
}
