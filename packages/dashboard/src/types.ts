// app-map 的类型描述(权威规范在 @understand-everything/core 的 zod 定义里,这里只是给编辑器提示用)
export type Content = string | { en: string; zh: string };
export type Lane = 'fe' | 'be' | 'db';
export type Grade = 'trivial' | 'routine' | 'consequential';
export type Lang = 'en' | 'zh';

export interface CodeBlock { c: string; n: Content; risk?: Content | null; lines?: (Content | '')[] | null }
export interface Tradeoff { a: Content; b: Content; cost: Content; when: Content }

export interface MapNode {
  lane: Lane;
  tool: string;
  grade: Grade;
  needs: string[];
  feeds: string[];
  name: Content;
  role: Content;
  contents?: Content[] | null;   // v2:这一站里装着什么(1–8 条)
  before?: Content[] | null;     // v2:没有它时系统什么样(1–3 条)
  after?: Content[] | null;      // v2:有了它,什么被改善(1–3 条)
  impact: Content[];             // v1:宽泛影响 2–3 条;v2:你承担的成本与风险 0–2 条
  how: Content;
  fail?: Content;
  code: CodeBlock[] | null;
  tradeoff?: Tradeoff | null;
  tourHint?: Content;
}

export interface AppMap {
  version: 1 | 2;
  language: 'en' | 'zh' | 'both';
  project: { name: Content; scenario: Content; pain: Content; now: Content };
  chain: string[];
  nodes: Record<string, MapNode>;
  diff: { changed: string[]; affected: string[] };
}
