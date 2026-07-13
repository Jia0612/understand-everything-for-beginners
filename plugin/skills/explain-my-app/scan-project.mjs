#!/usr/bin/env node
/**
 * scan-project.mjs — 扫描一个项目,认出它的技术栈和值得细读的关键文件。
 * 确定性脚本(不用 AI):同一个项目跑两次,结果完全一样。
 *
 * 用法: node scan-project.mjs <projectRoot> <outputPath>
 *
 * 输出 JSON:
 *   {
 *     scriptCompleted: true,
 *     projectName,                      // package.json 的 name,没有就用目录名
 *     readme: { path, head } | null,    // README 开头,供生成器读业务背景
 *     stack: [{ tool, lane, evidence }],// 认出的技术,fe/be/db 三条泳道
 *     candidateFiles: [{ path, reason, sizeLines }],  // 建议细读的文件
 *     envFiles: [],                     // 只登记存在,内容绝不读取(里面是密钥)
 *     files: [{ path, language, sizeLines }],
 *     totalFiles, estimatedComplexity,
 *     stats: { byLanguage }
 *   }
 *
 * 日志只走 stderr(stdout 留给管道工具)。单个文件读取失败只警告不中断。
 * 骨架参考 Understand-Anything (MIT) 的 scan-project.mjs,按本项目需要简化。
 */

import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// 语言识别:扩展名 → 语言。认不出的返回扩展名本身或 unknown,永不报错。
// ---------------------------------------------------------------------------

const LANGUAGE_BY_EXT = Object.freeze({
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.rb': 'ruby', '.php': 'php', '.cs': 'csharp',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
  '.vue': 'vue', '.svelte': 'svelte',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell',
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'css', '.less': 'css',
  '.md': 'markdown', '.mdx': 'markdown',
  '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json', '.toml': 'toml', '.xml': 'xml',
  '.sql': 'sql', '.graphql': 'graphql', '.prisma': 'prisma', '.proto': 'protobuf',
  '.tf': 'terraform', '.env': 'config', '.ini': 'config', '.cfg': 'config',
});

const LANGUAGE_BY_FILENAME = Object.freeze({
  Dockerfile: 'dockerfile', Makefile: 'makefile', Procfile: 'procfile',
});

// 识别单个文件的语言(按扩展名/文件名查表)
export function detectLanguage(filePath) {
  const base = basename(filePath);
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return 'dockerfile';
  // 点开头的文件(.env、.env.local):取第一段当扩展名
  if (base.startsWith('.')) {
    const m = base.match(/^(\.[a-z0-9]+)/i);
    if (m && LANGUAGE_BY_EXT[m[1].toLowerCase()]) return LANGUAGE_BY_EXT[m[1].toLowerCase()];
  }
  const ext = extname(filePath).toLowerCase();
  if (ext) return LANGUAGE_BY_EXT[ext] || ext.slice(1);
  return LANGUAGE_BY_FILENAME[base] || 'unknown';
}

// 项目规模分级(文件数 → small/moderate/large/very-large)
export function estimateComplexity(totalFiles) {
  if (totalFiles <= 30) return 'small';
  if (totalFiles <= 150) return 'moderate';
  if (totalFiles <= 500) return 'large';
  return 'very-large';
}

// ---------------------------------------------------------------------------
// 技术栈识别:依赖名 → { tool, lane }。lane: fe=前端 be=后端 db=数据库/云服务
// ---------------------------------------------------------------------------

const NPM_DEP_RULES = Object.freeze({
  // 前端
  react: { tool: 'React', lane: 'fe' },
  vue: { tool: 'Vue', lane: 'fe' },
  svelte: { tool: 'Svelte', lane: 'fe' },
  next: { tool: 'Next.js', lane: 'fe' },
  nuxt: { tool: 'Nuxt', lane: 'fe' },
  'react-native': { tool: 'React Native', lane: 'fe' },
  expo: { tool: 'Expo', lane: 'fe' },
  vite: { tool: 'Vite', lane: 'fe' },
  tailwindcss: { tool: 'Tailwind CSS', lane: 'fe' },
  electron: { tool: 'Electron', lane: 'fe' },
  // 后端
  express: { tool: 'Express', lane: 'be' },
  koa: { tool: 'Koa', lane: 'be' },
  fastify: { tool: 'Fastify', lane: 'be' },
  '@nestjs/core': { tool: 'NestJS', lane: 'be' },
  hono: { tool: 'Hono', lane: 'be' },
  'socket.io': { tool: 'Socket.IO', lane: 'be' },
  '@anthropic-ai/sdk': { tool: 'Claude API', lane: 'be' },
  openai: { tool: 'OpenAI API', lane: 'be' },
  // 数据库 / 存储 / 云服务(规格:存储和云服务都算 db)
  pg: { tool: 'PostgreSQL', lane: 'db' },
  mysql: { tool: 'MySQL', lane: 'db' },
  mysql2: { tool: 'MySQL', lane: 'db' },
  mongodb: { tool: 'MongoDB', lane: 'db' },
  mongoose: { tool: 'MongoDB', lane: 'db' },
  redis: { tool: 'Redis', lane: 'db' },
  ioredis: { tool: 'Redis', lane: 'db' },
  prisma: { tool: 'Prisma', lane: 'db' },
  '@prisma/client': { tool: 'Prisma', lane: 'db' },
  'drizzle-orm': { tool: 'Drizzle', lane: 'db' },
  sequelize: { tool: 'Sequelize', lane: 'db' },
  knex: { tool: 'Knex', lane: 'db' },
  sqlite3: { tool: 'SQLite', lane: 'db' },
  'better-sqlite3': { tool: 'SQLite', lane: 'db' },
  '@supabase/supabase-js': { tool: 'Supabase', lane: 'db' },
  firebase: { tool: 'Firebase', lane: 'db' },
  'firebase-admin': { tool: 'Firebase', lane: 'db' },
  'aws-sdk': { tool: 'AWS', lane: 'db' },
  '@aws-sdk/client-s3': { tool: 'AWS S3', lane: 'db' },
});

const PY_DEP_RULES = Object.freeze({
  django: { tool: 'Django', lane: 'be' },
  flask: { tool: 'Flask', lane: 'be' },
  fastapi: { tool: 'FastAPI', lane: 'be' },
  celery: { tool: 'Celery', lane: 'be' },
  anthropic: { tool: 'Claude API', lane: 'be' },
  openai: { tool: 'OpenAI API', lane: 'be' },
  streamlit: { tool: 'Streamlit', lane: 'fe' },
  gradio: { tool: 'Gradio', lane: 'fe' },
  sqlalchemy: { tool: 'SQLAlchemy', lane: 'db' },
  psycopg2: { tool: 'PostgreSQL', lane: 'db' },
  'psycopg2-binary': { tool: 'PostgreSQL', lane: 'db' },
  pymongo: { tool: 'MongoDB', lane: 'db' },
  redis: { tool: 'Redis', lane: 'db' },
  boto3: { tool: 'AWS', lane: 'db' },
  supabase: { tool: 'Supabase', lane: 'db' },
});

// docker-compose 里的镜像名 → 工具
const DOCKER_IMAGE_RULES = Object.freeze({
  postgres: { tool: 'PostgreSQL', lane: 'db' },
  mysql: { tool: 'MySQL', lane: 'db' },
  mariadb: { tool: 'MySQL', lane: 'db' },
  mongo: { tool: 'MongoDB', lane: 'db' },
  redis: { tool: 'Redis', lane: 'db' },
  rabbitmq: { tool: 'RabbitMQ', lane: 'be' },
  nginx: { tool: 'Nginx', lane: 'be' },
});

/**
 * 从清单文件内容认技术栈。
 * 入参: { '文件相对路径': '文件内容', ... }(只应传入清单/配置文件,绝不传 .env)
 * 返回: [{ tool, lane, evidence }],按工具名排序,去重。
 */
export function detectStack(manifestContents) {
  const found = new Map(); // tool -> { tool, lane, evidence }
  const add = (rule, evidence) => {
    if (!found.has(rule.tool)) found.set(rule.tool, { ...rule, evidence });
  };

  for (const [path, content] of Object.entries(manifestContents)) {
    const base = basename(path);

    if (base === 'package.json') {
      let pkg;
      try { pkg = JSON.parse(content); } catch { continue; }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const dep of Object.keys(deps)) {
        if (NPM_DEP_RULES[dep]) add(NPM_DEP_RULES[dep], `${path} dependencies.${dep}`);
      }
    }

    if (base === 'requirements.txt' || base === 'Pipfile' || base === 'pyproject.toml') {
      const lower = content.toLowerCase();
      for (const [dep, rule] of Object.entries(PY_DEP_RULES)) {
        // 按行匹配依赖名开头,避免误伤(如 "redis" 出现在注释里)
        const rx = new RegExp(`^\\s*"?${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=["\\s=<>!~\\[]|$)`, 'm');
        if (rx.test(lower)) add(rule, `${path}: ${dep}`);
      }
    }

    if (base.startsWith('docker-compose') || base === 'compose.yml' || base === 'compose.yaml') {
      for (const m of content.matchAll(/image:\s*["']?([a-z0-9._/-]+)/gi)) {
        const image = m[1].split(':')[0].split('/').pop();
        if (DOCKER_IMAGE_RULES[image]) add(DOCKER_IMAGE_RULES[image], `${path} image: ${m[1]}`);
      }
    }

    if (base === 'schema.prisma') add({ tool: 'Prisma', lane: 'db' }, path);
    if (base === 'serverless.yml' || base === 'serverless.yaml') {
      add({ tool: 'AWS Lambda', lane: 'be' }, path);
    }
  }

  return [...found.values()].sort((a, b) => a.tool.localeCompare(b.tool));
}

// ---------------------------------------------------------------------------
// 关键文件挑选:入口、清单、配置、数据结构文件——生成器优先细读这些
// ---------------------------------------------------------------------------

const MANIFEST_NAMES = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile',
  'go.mod', 'Cargo.toml', 'Gemfile', 'composer.json',
]);

const CONFIG_NAMES_RX = /^(vite|next|nuxt|svelte|astro|tailwind|webpack|rollup|jest|vitest|playwright)\.config\.[a-z]+$/;

const INFRA_NAMES_RX = /^(docker-compose.*\.ya?ml|compose\.ya?ml|serverless\.ya?ml|Dockerfile.*|vercel\.json|netlify\.toml|fly\.toml)$/;

const ENTRY_RX = /^(src\/|app\/|)?(index|main|app|server|cli)\.(ts|tsx|js|jsx|mjs|py|go|rs)$/;

const CANDIDATE_CAP = 40;

/**
 * 从文件清单挑出值得细读的文件。
 * 入参: [{ path, sizeLines }],返回 [{ path, reason, sizeLines }](有上限,排序稳定)。
 */
export function pickCandidateFiles(files) {
  const out = [];
  for (const f of files) {
    const base = basename(f.path);
    const depth = f.path.split('/').length;
    let reason = null;
    if (/^readme(\.|$)/i.test(base) && depth === 1) reason = 'readme';
    else if (MANIFEST_NAMES.has(base) && depth <= 2) reason = 'manifest';
    else if (CONFIG_NAMES_RX.test(base)) reason = 'config';
    else if (INFRA_NAMES_RX.test(base)) reason = 'infra';
    else if (base === 'schema.prisma' || (f.path.includes('migrations/') && base.endsWith('.sql'))) reason = 'schema';
    else if (ENTRY_RX.test(f.path) && depth <= 2) reason = 'entry';
    if (reason) out.push({ path: f.path, reason, sizeLines: f.sizeLines });
  }
  // 稳定排序:先按类别重要度,再按路径
  const rank = { readme: 0, manifest: 1, entry: 2, schema: 3, infra: 4, config: 5 };
  out.sort((a, b) => (rank[a.reason] - rank[b.reason]) || a.path.localeCompare(b.path));
  return out.slice(0, CANDIDATE_CAP);
}

// ---------------------------------------------------------------------------
// 文件枚举:优先 git ls-files(尊重 .gitignore),不是 git 仓库就递归遍历
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__', '.venv', 'venv',
  'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.turbo', 'target',
]);

const SKIP_FILES_RX = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|\.DS_Store)$/;

const BINARY_EXT_RX = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|eot|mp[34]|mov|zip|gz|tar|pdf|exe|bin|wasm|node)$/i;

function toPosix(p) { return p.split(sep).join('/'); }

function enumerateViaGit(projectRoot) {
  const res = spawnSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], {
    cwd: projectRoot, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) return null;
  return res.stdout.split('\0').filter(Boolean).map(toPosix);
}

function enumerateViaWalk(projectRoot) {
  const out = [];
  function walk(absDir) {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      process.stderr.write(`Warning: scan-project: ${toPosix(relative(projectRoot, absDir)) || '.'} — 目录读取失败 (${err.message}) — 跳过该子树\n`);
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(join(absDir, ent.name));
      } else if (ent.isFile()) {
        out.push(toPosix(relative(projectRoot, join(absDir, ent.name))));
      }
      // 符号链接故意不跟——防止循环链接把遍历炸掉
    }
  }
  walk(projectRoot);
  return out;
}

// 数行数(等价 wc -l:数换行符)
function countLines(absPath, posixPath) {
  try {
    const buf = readFileSync(absPath);
    let n = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) n++;
    return n;
  } catch (err) {
    process.stderr.write(`Warning: scan-project: ${posixPath} — 行数统计失败 (${err.message}) — 跳过该文件\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const README_HEAD_LINES = 60;

async function main() {
  const [, , projectRoot, outputPath] = process.argv;
  if (!projectRoot || !outputPath) {
    process.stderr.write('用法: node scan-project.mjs <projectRoot> <outputPath>\n');
    process.exit(1);
  }
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    process.stderr.write(`scan-project 失败: 项目目录不存在或不是目录: ${projectRoot}\n`);
    process.exit(1);
  }

  // 1. 列出所有文件(git 优先,否则递归遍历),过滤垃圾目录/锁文件/二进制
  const candidates = enumerateViaGit(projectRoot) ?? enumerateViaWalk(projectRoot);
  const kept = [];
  const envFiles = [];
  for (const rel of candidates) {
    const parts = rel.split('/');
    if (parts.some(p => SKIP_DIRS.has(p))) continue;
    if (SKIP_FILES_RX.test(rel)) continue;
    if (BINARY_EXT_RX.test(rel)) continue;
    // .env 系列:只登记存在,内容绝不读取(里面是密钥)
    if (/^\.env(\.|$)/.test(basename(rel))) { envFiles.push(rel); continue; }
    kept.push(rel);
  }

  // 2. 逐文件:语言 + 行数(读取失败只警告,不中断整体扫描)
  const files = [];
  for (const rel of kept) {
    const abs = join(projectRoot, rel);
    try {
      if (!statSync(abs).isFile()) continue;
    } catch { continue; }
    const sizeLines = countLines(abs, rel);
    if (sizeLines === null) continue;
    files.push({ path: rel, language: detectLanguage(rel), sizeLines });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  // 3. 读清单文件内容 → 认技术栈(.env 已被排除,不会被读)
  const manifestContents = {};
  for (const f of files) {
    const base = basename(f.path);
    const isManifest = MANIFEST_NAMES.has(base)
      || base.startsWith('docker-compose') || base === 'compose.yml' || base === 'compose.yaml'
      || base === 'schema.prisma' || base === 'serverless.yml' || base === 'serverless.yaml';
    if (isManifest && f.path.split('/').length <= 3) {
      try {
        manifestContents[f.path] = readFileSync(join(projectRoot, f.path), 'utf-8');
      } catch { /* 读不了就跳过,detectStack 少一条线索而已 */ }
    }
  }
  const stack = detectStack(manifestContents);

  // 4. 项目名:根 package.json / pyproject.toml 的 name,兜底用目录名
  let projectName = basename(realpathSync(projectRoot));
  try {
    if (manifestContents['package.json']) {
      const n = JSON.parse(manifestContents['package.json']).name;
      if (n) projectName = n;
    } else if (manifestContents['pyproject.toml']) {
      const m = manifestContents['pyproject.toml'].match(/^name\s*=\s*["']([^"']+)["']/m);
      if (m) projectName = m[1];
    }
  } catch { /* 清单坏了就用目录名 */ }

  // 5. README 开头(业务背景的唯一合法来源之一)
  let readme = null;
  const readmeFile = files.find(f => /^readme\.(md|txt|rst)$/i.test(f.path));
  if (readmeFile) {
    try {
      const head = readFileSync(join(projectRoot, readmeFile.path), 'utf-8')
        .split('\n').slice(0, README_HEAD_LINES).join('\n');
      readme = { path: readmeFile.path, head };
    } catch { /* 读不了就算没有 */ }
  }

  const output = {
    scriptCompleted: true,
    projectName,
    readme,
    stack,
    candidateFiles: pickCandidateFiles(files),
    envFiles,
    files,
    totalFiles: files.length,
    estimatedComplexity: estimateComplexity(files.length),
    stats: {
      byLanguage: files.reduce((acc, f) => {
        acc[f.language] = (acc[f.language] || 0) + 1;
        return acc;
      }, {}),
    },
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  process.stderr.write(
    `scan-project: files=${files.length} stack=[${stack.map(s => s.tool).join(', ')}] complexity=${output.estimatedComplexity}\n`,
  );
}

// 只在被当作命令行工具直接执行时才跑主流程;被测试 import 时不跑。
// realpath 两边都做,防止符号链接安装路径导致判断失灵(UA issue #162 同款坑)。
function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch { return false; }
}

if (isCliEntry()) {
  try {
    await main();
  } catch (err) {
    process.stderr.write(`scan-project.mjs failed: ${err.message}\n${err.stack}\n`);
    process.exit(1);
  }
}
