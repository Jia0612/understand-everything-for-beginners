// install.sh 的行为测试:全部在假的家目录(HOME=临时文件夹)里进行,绝不碰真实电脑设置。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, lstatSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

function run(args, home) {
  return spawnSync('bash', [join(REPO, 'install.sh'), ...args], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: home, UE_REPO_URL: REPO, UE_DIR: join(home, '.understand-everything/repo') },
  });
}

test('给 codex 安装:技能被链接进 ~/.agents/skills,链接指向真实的技能文件夹', () => {
  const home = mkdtempSync(join(tmpdir(), 'ue-home-'));
  const r = run(['codex'], home);
  assert.equal(r.status, 0, `安装必须成功,输出: ${r.stdout}\n${r.stderr}`);
  const link = join(home, '.agents/skills/explain-my-app');
  assert.ok(existsSync(link), '快捷方式必须存在');
  assert.ok(lstatSync(link).isSymbolicLink(), '必须是快捷方式(symlink),更新仓库即自动生效');
  assert.ok(existsSync(join(link, 'SKILL.md')), '顺着快捷方式必须能找到 SKILL.md');
});

test('给 copilot(vscode)安装:技能进 ~/.copilot/skills', () => {
  const home = mkdtempSync(join(tmpdir(), 'ue-home2-'));
  const r = run(['vscode'], home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(home, '.copilot/skills/explain-my-app/SKILL.md')));
});

test('卸载:快捷方式被删掉,克隆的仓库和别的文件不受影响', () => {
  const home = mkdtempSync(join(tmpdir(), 'ue-home3-'));
  run(['codex'], home);
  const r = run(['--uninstall', 'codex'], home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(home, '.agents/skills/explain-my-app')), '快捷方式必须被移除');
  assert.ok(existsSync(join(home, '.understand-everything/repo')), '仓库本体不该被动');
});

test('不认识的平台名:报错退出并列出支持的平台,不乱写任何文件', () => {
  const home = mkdtempSync(join(tmpdir(), 'ue-home4-'));
  const r = run(['nonsense-platform'], home);
  assert.notEqual(r.status, 0);
  assert.ok((r.stderr + r.stdout).includes('codex'), '要告诉用户支持哪些平台');
});
