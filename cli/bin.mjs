#!/usr/bin/env node
/**
 * npx understand-everything — 在任何项目文件夹里跑这一条命令:
 * 找到本项目的地图文件(.ue/app-map.json 或 app-map.json),
 * 起一个本地小服务,自动打开浏览器显示仪表盘。没有配置。
 */

import http from 'node:http';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHandler } from './server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();

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

// 3. 起服务:优先用 4870 端口,被占用就让系统随机分配一个空闲端口
const server = http.createServer(createHandler(distDir, mapPath));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') server.listen(0, '127.0.0.1');
  else { process.stderr.write(`understand-everything: ${err.message}\n`); process.exit(1); }
});
server.listen(4870, '127.0.0.1', () => {
  const url = `http://localhost:${server.address().port}`;
  process.stderr.write(
    `understand-everything ${url}\n` +
    (mapPath ? `  地图: ${mapPath}\n` : '  本项目还没有地图文件——先在 AI 工具里运行 /explain-my-app;现在展示示例项目。\n') +
    '  Ctrl+C 退出\n',
  );
  // 自动打开浏览器(打不开也不要紧,手动访问上面的地址即可)。--no-open 或 UE_NO_OPEN=1 则不弹。
  if (!process.argv.includes('--no-open') && !process.env.UE_NO_OPEN) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
});
