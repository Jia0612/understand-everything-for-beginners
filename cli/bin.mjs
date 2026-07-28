#!/usr/bin/env node
/**
 * npx understand-everything — 在任何项目文件夹里跑这一条命令:
 * 找到本项目的地图文件(.ue/app-map.json 或 app-map.json),
 * 起一个本地小服务,自动打开浏览器显示仪表盘。没有配置文件。
 *
 * 实时解释的 key(X 方案):环境变量优先;否则读本机保险柜
 * (~/.understand-everything/keys.json,权限 0600);两处都没有且在
 * 交互终端里时,首次启动会问你一次,贴一次永久生效。
 * `--forget-keys` 清空保险柜。key 永不进浏览器、不进代码仓库。
 */

import http from 'node:http';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { createExplainer, createHandler } from './server.mjs';
import { DEFAULT_KEYS_FILE, detectProvider, forgetKeys, loadKeys, saveKey } from './keys.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();

// --forget-keys:清空保险柜后直接退出
if (process.argv.includes('--forget-keys')) {
  forgetKeys();
  process.stderr.write(`已清空 key 保险柜(${DEFAULT_KEYS_FILE})。\n`);
  process.exit(0);
}

// 1. 找地图文件:优先 .ue/app-map.json,其次项目根的 app-map.json;都没有也照样打开(仪表盘会展示示例项目)
const mapCandidates = [join(cwd, '.ue', 'app-map.json'), join(cwd, 'app-map.json')];
const mapPath = mapCandidates.find(existsSync) ?? null;

// 2. 找仪表盘成品:发布包内的 dist/,或本仓库开发布局下的 packages/dashboard/dist
const distCandidates = [
  join(__dirname, 'dist'),
  resolve(__dirname, '../packages/dashboard/dist'),
];
const distDir = distCandidates.find((d) => existsSync(join(d, 'index.html')));
if (!distDir) {
  process.stderr.write(
    'understand-everything: 找不到仪表盘成品。开发环境请先执行:\n  npm run build --workspace packages/dashboard\n',
  );
  process.exit(1);
}

// 3. 凑齐 key:环境变量 > 保险柜;都空且在交互终端里,就问一次并存柜
const keys = loadKeys(process.env);
if (Object.keys(keys).length === 0 && process.stdin.isTTY && !process.env.UE_NO_PROMPT) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer = (await rl.question(
    '要开启「选词实时解释」吗?粘贴一个 API key(Claude / OpenAI / Gemini 都行,回车跳过): ',
  )).trim();
  if (answer) {
    let provider = detectProvider(answer);
    if (!provider) {
      const which = (await rl.question('认不出这把 key 是哪家的。输入 1=Claude 2=OpenAI 3=Gemini(回车放弃): ')).trim();
      provider = { 1: 'anthropic', 2: 'openai', 3: 'gemini' }[which] ?? null;
    }
    if (provider) {
      saveKey(provider, answer);
      keys[provider] = answer;
      process.stderr.write(`已存入保险柜(${DEFAULT_KEYS_FILE},仅你的账户可读)。想清除随时跑 --forget-keys。\n`);
    } else {
      process.stderr.write('没认出供应商,本次不开启实时解释。\n');
    }
  }
  rl.close();
}

// 配了哪几家就带哪几家备胎;UE_EXPLAIN_PROVIDER 可强指一家,UE_EXPLAIN_MODEL 换首选模型
const ORDER = ['anthropic', 'openai', 'gemini'];
const forced = process.env.UE_EXPLAIN_PROVIDER;
const providersList = (forced ? [forced] : ORDER)
  .filter((p) => keys[p])
  .map((p, i) => ({ provider: p, apiKey: keys[p], model: i === 0 ? (process.env.UE_EXPLAIN_MODEL || undefined) : undefined }));
const explainer = createExplainer({ providers: providersList });

// 4. 起服务:优先用 4870 端口,被占用就大声说明并改用随机空闲端口
const server = http.createServer(createHandler(distDir, mapPath, explainer));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write('⚠ 4870 端口已被占用——可能有一个(旧的)仪表盘还开着。本次改用随机端口,建议关掉旧的那个。\n');
    server.listen(0, '127.0.0.1');
  } else { process.stderr.write(`understand-everything: ${err.message}\n`); process.exit(1); }
});
server.listen(4870, '127.0.0.1', () => {
  const url = `http://localhost:${server.address().port}`;
  process.stderr.write(
    `understand-everything ${url}\n` +
    (mapPath ? `  地图: ${mapPath}\n` : '  本项目还没有地图文件——先在 AI 工具里运行 /explain-my-app;现在展示示例项目。\n') +
    (providersList.length
      ? `  实时解释: 已开启(${providersList.map((p) => p.provider).join(' → ')},会使用你的 API 额度)\n`
      : '  实时解释: 未开启——重启并按提示贴一次 key,或先 export 任一家的 API key;词典查询不受影响\n') +
    '  Ctrl+C 退出\n',
  );
  // 自动打开浏览器(打不开也不要紧,手动访问上面的地址即可)。--no-open 或 UE_NO_OPEN=1 则不弹。
  if (!process.argv.includes('--no-open') && !process.env.UE_NO_OPEN) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
});
