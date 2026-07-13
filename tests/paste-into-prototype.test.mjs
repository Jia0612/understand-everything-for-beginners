// 回归测试:2026-07-13 M1 试跑发现的 bug——
// 生成的讲解里若引用了含 </script> 的真实代码,直接贴进原型会把页面 JS 拦腰截断。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '../scripts/paste-into-prototype.mjs');

const FAKE_HTML = `<html><script>
var DEMO = {
  old: true
};
var DATA = DEMO;
</script></html>`;

test('讲解代码里含 </script> 时,贴进原型页面后不能把页面程序截断', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ue-paste-'));
  const html = join(dir, 'proto.html');
  const map = join(dir, 'map.json');
  writeFileSync(html, FAKE_HTML, 'utf-8');
  writeFileSync(map, JSON.stringify({
    nodes: { course: { code: [{ c: '<script src="main.js" defer></script>' }] } },
  }, null, 2), 'utf-8');

  const r = spawnSync('node', [SCRIPT, html, map], { encoding: 'utf-8' });
  assert.equal(r.status, 0, `贴入脚本必须成功,stderr: ${r.stderr}`);

  const out = readFileSync(html, 'utf-8');
  const demoStart = out.indexOf('var DEMO = {');
  const demoEnd = out.indexOf('\n};', demoStart);
  const demoBlock = out.slice(demoStart, demoEnd);
  assert.ok(!demoBlock.includes('</script>'), '贴入的数据里不能出现裸的 </script>');
  assert.ok(demoBlock.includes('<\\/script>'), '应转义成 <\\/script>(页面读出来仍是原字符串)');
  assert.ok(out.includes('var DATA = DEMO;'), '页面后半段程序必须还在');
});

test('贴入后再跑一次(重复贴)也必须成功——替换要能定位到新的 DEMO 块', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ue-paste2-'));
  const html = join(dir, 'proto.html');
  const map = join(dir, 'map.json');
  writeFileSync(html, FAKE_HTML, 'utf-8');
  writeFileSync(map, JSON.stringify({ hello: '第一次' }, null, 2), 'utf-8');
  spawnSync('node', [SCRIPT, html, map], { encoding: 'utf-8' });
  writeFileSync(map, JSON.stringify({ hello: '第二次' }, null, 2), 'utf-8');
  const r = spawnSync('node', [SCRIPT, html, map], { encoding: 'utf-8' });
  assert.equal(r.status, 0);
  const out = readFileSync(html, 'utf-8');
  assert.ok(out.includes('第二次') && !out.includes('第一次'), '第二次贴入要完整替换第一次的');
});
