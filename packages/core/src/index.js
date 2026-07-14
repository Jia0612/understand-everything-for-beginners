/**
 * @understand-everything/core — app-map.json 的正式规范(zod 版)。
 * 这是数据契约的唯一权威定义,仪表盘(M3)和命令行(M4)都从这里取。
 * 插件目录里还有一份零依赖的 validate-schema.mjs 供离线使用——
 * 两套检查的判决必须一致,tests/core-schema.test.mjs 专门盯着这件事。
 */

import { z } from 'zod';

export const LANES = ['fe', 'be', 'db'];
export const GRADES = ['trivial', 'routine', 'consequential'];
export const CHAIN_MIN = 4;
export const CHAIN_MAX = 15;

// 一句内容:单语字符串,或中英一对(两边都不能空)
const nonEmpty = z.string().trim().min(1);
const biPair = z.object({ en: nonEmpty, zh: nonEmpty });
const content = z.union([nonEmpty, biPair], {
  errorMap: () => ({ message: 'must be a non-empty string or a bilingual {en, zh} pair (both non-empty)' }),
});
// 允许留空的内容(宁缺勿编)
const contentOrEmpty = z.union([z.literal(''), content]);

const codeBlockSchema = z.object({
  c: nonEmpty,                                // 真实代码行,不分语言
  n: content,                                 // 每块一条大白话注解
  risk: content.nullable().optional(),        // 只有碰外部 API/写存储/难回退的行才有
});

const tradeoffSchema = z.object({
  a: content,                                 // 选了什么
  b: content,                                 // 没选什么
  cost: content,                              // 代价
  when: content,                              // 什么时候该换(可操作的信号)
});

const nodeSchema = z.object({
  lane: z.enum(['fe', 'be', 'db']),
  tool: nonEmpty,                             // 技术名,两种语言写法一样
  grade: z.enum(['trivial', 'routine', 'consequential']),
  needs: z.array(z.string()),
  feeds: z.array(z.string()),
  name: content,
  role: content,
  how: content,
  impact: z.array(content),
  fail: contentOrEmpty.optional(),
  code: z.array(codeBlockSchema).min(1, 'must be null (configured, not coded) or a non-empty array of blocks').nullable(),
  tradeoff: tradeoffSchema.nullable().optional(),
  tourHint: contentOrEmpty.optional(),
});

/**
 * 完整的 app-map 规范。字段形状由上面的定义把关;
 * 跨字段规则(chain 引用、等级管内容)在 superRefine 里补齐。
 */
export const appMapSchema = z.object({
  version: z.literal(1),
  language: z.enum(['en', 'zh', 'both']),
  project: z.object({
    name: content,
    scenario: contentOrEmpty,                 // 只能来自 README/用户,宁缺勿编
    pain: contentOrEmpty,
    now: contentOrEmpty,
  }),
  chain: z.array(z.string())
    .min(CHAIN_MIN, `must have ${CHAIN_MIN}–${CHAIN_MAX} parts`)
    .max(CHAIN_MAX, `must have ${CHAIN_MIN}–${CHAIN_MAX} parts`),
  nodes: z.record(z.string(), nodeSchema),
  diff: z.object({
    changed: z.array(z.string()),
    affected: z.array(z.string()),
  }),
}).superRefine((m, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const nodeIds = Object.keys(m.nodes);

  // chain 不重复,且每个 id 都真实存在
  if (new Set(m.chain).size !== m.chain.length) issue(['chain'], 'contains duplicate ids');
  for (const id of m.chain) {
    if (!m.nodes[id]) issue(['chain'], `references unknown node "${id}"`);
  }
  // 每个零件都必须在数据流上(不然画布摆不下它)
  for (const id of nodeIds) {
    if (!m.chain.includes(id)) issue(['nodes', id], 'not in chain — every node must sit on the data flow');
  }

  for (const [id, n] of Object.entries(m.nodes)) {
    // 依赖引用必须真实存在
    for (const k of ['needs', 'feeds']) {
      for (const ref of n[k]) {
        if (!m.nodes[ref]) issue(['nodes', id, k], `references unknown node "${ref}"`);
      }
    }
    // 等级管内容:trivial 只讲角色和原理;routine 加影响和故障;consequential 再加取舍
    if (n.grade === 'trivial') {
      if (n.impact.length !== 0) issue(['nodes', id, 'impact'], 'trivial parts carry no impact list');
    } else {
      if (n.impact.length < 2 || n.impact.length > 3) {
        issue(['nodes', id, 'impact'], `must have 2–3 items for ${n.grade} parts, got ${n.impact.length}`);
      }
      const failOk = typeof n.fail === 'string' ? n.fail.trim().length > 0 : n.fail != null;
      if (!failOk) issue(['nodes', id, 'fail'], `required for ${n.grade} parts`);
    }
    if (n.grade === 'consequential') {
      if (n.tradeoff == null) {
        issue(['nodes', id, 'tradeoff'], 'required for consequential parts (chose A over B, cost, when to switch)');
      }
    } else if (n.tradeoff != null) {
      issue(['nodes', id, 'tradeoff'], `must be null unless grade is consequential (got grade "${n.grade}")`);
    }
  }

  // diff 引用必须真实存在
  for (const k of ['changed', 'affected']) {
    for (const ref of m.diff[k]) {
      if (!m.nodes[ref]) issue(['diff', k], `references unknown node "${ref}"`);
    }
  }
});

/**
 * 校验一个已解析的 app-map 对象。
 * 返回 { valid, errors: string[] },每条错误点名具体位置,可直接喂回给生成器修正。
 */
export function validateAppMap(obj) {
  const result = appMapSchema.safeParse(obj);
  if (result.success) return { valid: true, errors: [] };
  const errors = result.error.issues.map(
    (i) => `${i.path.length ? i.path.join('.') : 'root'}: ${i.message}`,
  );
  return { valid: false, errors };
}

/**
 * 生成 + 校验 + 最多重试一次(BUILD-SPEC §4 第 3 步的标准流程)。
 * generateFn(previousErrors) 负责产出一个 app-map 对象:
 * 第一次调用时 previousErrors 是 null;重试时是上一次的错误清单。
 * 两次都不合格就抛错——绝不把坏数据交出去。
 */
export async function generateWithRetry(generateFn) {
  const first = await generateFn(null);
  const r1 = validateAppMap(first);
  if (r1.valid) return first;

  const second = await generateFn(r1.errors);
  const r2 = validateAppMap(second);
  if (r2.valid) return second;

  throw new Error(
    `app-map failed validation twice — refusing to emit broken data:\n${r2.errors.map((e) => `  - ${e}`).join('\n')}`,
  );
}
