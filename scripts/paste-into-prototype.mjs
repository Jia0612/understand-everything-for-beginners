#!/usr/bin/env node
/**
 * paste-into-prototype.mjs — 把一份 app-map.json 安全地贴进原型页面(替换 DEMO 对象)。
 * 关键动作:把数据里的 "</" 转义成 "<\/",防止代码片段里的 </script>
 * 把页面自己的程序拦腰截断(2026-07-13 M1 试跑踩到的真 bug)。
 *
 * 用法: node paste-into-prototype.mjs <prototype.html> <app-map.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , htmlPath, mapPath] = process.argv;
if (!htmlPath || !mapPath) {
  process.stderr.write('用法: node paste-into-prototype.mjs <prototype.html> <app-map.json>\n');
  process.exit(1);
}

const html = readFileSync(htmlPath, 'utf-8');
// 重新序列化保证格式稳定,再转义 "</"(JS 字符串里 <\/ 读出来仍是 </,页面内容不变)
const map = JSON.stringify(JSON.parse(readFileSync(mapPath, 'utf-8')), null, 2)
  .replace(/<\//g, '<\\/');

const start = html.indexOf('var DEMO = {');
if (start < 0) {
  process.stderr.write('paste-into-prototype 失败: 页面里找不到 "var DEMO = {"\n');
  process.exit(1);
}
const end = html.indexOf('\n};', start);
if (end < 0) {
  process.stderr.write('paste-into-prototype 失败: 找不到 DEMO 对象的结尾 "\\n};"\n');
  process.exit(1);
}

writeFileSync(htmlPath, `${html.slice(0, start)}var DEMO = ${map};${html.slice(end + 3)}`, 'utf-8');
process.stderr.write(`paste-into-prototype: 已替换 ${htmlPath} 的 DEMO(${map.length} 字符)\n`);
