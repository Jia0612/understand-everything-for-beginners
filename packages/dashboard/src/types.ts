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
  impact: Content[];
  how: Content;
  fail?: Content;
  code: CodeBlock[] | null;
  tradeoff?: Tradeoff | null;
  tourHint?: Content;
}

export interface AppMap {
  version: 1;
  language: 'en' | 'zh' | 'both';
  project: { name: Content; scenario: Content; pain: Content; now: Content };
  chain: string[];
  nodes: Record<string, MapNode>;
  diff: { changed: string[]; affected: string[] };
}
