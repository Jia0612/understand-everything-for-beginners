/**
 * 本地小服务器:把打包好的仪表盘 + 项目里的地图文件端给浏览器。
 * 零依赖,只用 Node 自带的模块。
 * 安全底线:只允许读 dist 文件夹里的东西,任何 ../ 越界一律 404。
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, extname, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * createHandler(distDir, mapPath) — 返回一个 http 请求处理函数。
 * distDir: 仪表盘打包产物目录;mapPath: 项目地图文件的绝对路径(可为 null)。
 */
export function createHandler(distDir, mapPath) {
  const distRoot = resolve(distDir);

  return function handle(req, res) {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);

    // 项目地图:单独路由,不走静态目录
    if (url === '/app-map.json') {
      if (mapPath && existsSync(mapPath)) {
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        createReadStream(mapPath).pipe(res);
      } else {
        res.writeHead(404); res.end('no app-map.json in this project');
      }
      return;
    }

    // 静态文件:归一化后必须仍在 dist 里面,否则就是越界攻击,404
    const rel = url === '/' ? 'index.html' : url.slice(1);
    const abs = resolve(distRoot, normalize(rel));
    if (abs !== distRoot && !abs.startsWith(distRoot + sep)) {
      res.writeHead(404); res.end('not found');
      return;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      // 未知路径回落到 index.html(单页应用的惯例),但绝不越界
      const fallback = join(distRoot, 'index.html');
      if (existsSync(fallback)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        createReadStream(fallback).pipe(res);
      } else {
        res.writeHead(404); res.end('not found');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream' });
    createReadStream(abs).pipe(res);
  };
}
