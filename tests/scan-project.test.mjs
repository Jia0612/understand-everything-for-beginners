// scan-project.mjs 的行为测试。每个测试名是一条大白话承诺。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  detectLanguage,
  estimateComplexity,
  detectStack,
  pickCandidateFiles,
} from '../plugin/skills/explain-my-app/scan-project.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '../plugin/skills/explain-my-app/scan-project.mjs');

// 造一个假项目目录,跑真实的 CLI,返回解析后的 JSON
function runScan(setup) {
  const root = mkdtempSync(join(tmpdir(), 'ue-scan-'));
  for (const [rel, content] of Object.entries(setup)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  const out = join(root, '_scan-out.json');
  const res = spawnSync('node', [SCRIPT, root, out], { encoding: 'utf-8' });
  assert.equal(res.status, 0, `扫描脚本必须正常退出,stderr: ${res.stderr}`);
  const json = JSON.parse(readFileSync(out, 'utf-8'));
  rmSync(root, { recursive: true, force: true });
  return json;
}

test('package.json 里的 React 归前端、Express 归后端、pg 归数据库', () => {
  const stack = detectStack({
    'package.json': JSON.stringify({
      dependencies: { react: '^18.0.0', express: '^4.18.0', pg: '^8.0.0' },
    }),
  });
  const byTool = Object.fromEntries(stack.map(s => [s.tool, s.lane]));
  assert.equal(byTool['React'], 'fe');
  assert.equal(byTool['Express'], 'be');
  assert.equal(byTool['PostgreSQL'], 'db');
});

test('Python 项目:requirements.txt 里的 Django 要被认出来,归后端', () => {
  const stack = detectStack({
    'requirements.txt': 'Django==4.2\npsycopg2-binary>=2.9\n',
  });
  const byTool = Object.fromEntries(stack.map(s => [s.tool, s.lane]));
  assert.equal(byTool['Django'], 'be');
  assert.equal(byTool['PostgreSQL'], 'db');
});

test('每条识别出的技术都带证据(来自哪个文件),供人工核对', () => {
  const stack = detectStack({
    'package.json': JSON.stringify({ dependencies: { react: '1' } }),
  });
  assert.ok(stack[0].evidence.includes('package.json'), '证据里必须写明来源文件');
});

test('扫描一个真实目录:结果文件按名字排序,跑两次完全一样', () => {
  const setup = {
    'package.json': JSON.stringify({ name: 'demo-app', dependencies: { react: '1' } }),
    'src/b.js': 'console.log(2)\n',
    'src/a.js': 'console.log(1)\n',
    'README.md': '# Demo\nA demo app.\n',
  };
  const one = runScan(setup);
  const two = runScan(setup);
  assert.equal(one.projectName, 'demo-app');
  const paths = one.files.map(f => f.path);
  assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b)), '文件必须按名字排序');
  assert.deepEqual(one.files, two.files, '两次扫描结果必须一致');
});

test('node_modules 和 .git 里的文件不进扫描结果', () => {
  const json = runScan({
    'package.json': '{"name":"x"}',
    'node_modules/react/index.js': 'x',
    'dist/bundle.js': 'x',
    'src/app.js': 'x',
  });
  const paths = json.files.map(f => f.path);
  assert.ok(paths.includes('src/app.js'));
  assert.ok(!paths.some(p => p.startsWith('node_modules/')), 'node_modules 不该出现');
  assert.ok(!paths.some(p => p.startsWith('dist/')), 'dist 不该出现');
});

test('.env 文件只登记存在,内容(密钥)绝不能出现在扫描结果里', () => {
  const json = runScan({
    'package.json': '{"name":"x"}',
    '.env': 'OPENAI_API_KEY=sk-secret-12345\n',
  });
  assert.ok(json.envFiles.includes('.env'), '.env 的存在要被登记');
  assert.ok(!JSON.stringify(json).includes('sk-secret-12345'), '密钥内容绝不能泄漏进结果');
});

test('README 开头会被带进清单,供后续读业务背景', () => {
  const json = runScan({
    'package.json': '{"name":"x"}',
    'README.md': '# 记账小工具\n给自由职业者用的记账 App。\n',
  });
  assert.ok(json.readme.head.includes('记账小工具'));
});

test('关键文件清单包含入口文件和配置文件,并说明入选原因', () => {
  const json = runScan({
    'package.json': JSON.stringify({ name: 'x', dependencies: { '@prisma/client': '1' } }),
    'src/index.ts': 'main()\n',
    'prisma/schema.prisma': 'model User { id Int @id }\n',
    'vite.config.ts': 'export default {}\n',
  });
  const byPath = Object.fromEntries(json.candidateFiles.map(f => [f.path, f.reason]));
  assert.equal(byPath['src/index.ts'], 'entry');
  assert.equal(byPath['prisma/schema.prisma'], 'schema');
  assert.equal(byPath['vite.config.ts'], 'config');
  assert.equal(byPath['package.json'], 'manifest');
});

test('文件语言按扩展名识别,识别不了的不报错、标 unknown', () => {
  assert.equal(detectLanguage('src/App.tsx'), 'typescript');
  assert.equal(detectLanguage('main.py'), 'python');
  assert.equal(detectLanguage('Dockerfile'), 'dockerfile');
  assert.equal(detectLanguage('weirdfile'), 'unknown');
});

test('项目规模分级:30 个文件算 small,500 个以上算 very-large', () => {
  assert.equal(estimateComplexity(30), 'small');
  assert.equal(estimateComplexity(31), 'moderate');
  assert.equal(estimateComplexity(500), 'large');
  assert.equal(estimateComplexity(501), 'very-large');
});

test('docker-compose 里的 postgres/redis 服务要被认出来,归数据库', () => {
  const stack = detectStack({
    'docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n',
  });
  const byTool = Object.fromEntries(stack.map(s => [s.tool, s.lane]));
  assert.equal(byTool['PostgreSQL'], 'db');
  assert.equal(byTool['Redis'], 'db');
});
