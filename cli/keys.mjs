/**
 * key 保险柜 — X 方案(2026-07-28 用户拍板,取代"只走环境变量")。
 * key 存在本机 ~/.understand-everything/keys.json,权限锁死 0600(仅本人可读写);
 * 环境变量永远优先于柜子;`--forget-keys` 一键清空。
 * key 依旧绝不进浏览器、不进代码仓库、不上传任何地方。
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const KEYS_FILE_MODE = 0o600;
export const DEFAULT_KEYS_FILE = join(homedir(), '.understand-everything', 'keys.json');

const ENV_NAMES = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };

/** 凭 key 的长相认供应商;认不出返回 null(由调用方再问用户)。 */
export function detectProvider(key) {
  const k = String(key ?? '').trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

/** 读 key:环境变量优先,柜子兜底。返回 { anthropic?, openai?, gemini? }。 */
export function loadKeys(env = process.env, file = DEFAULT_KEYS_FILE) {
  let stored = {};
  try {
    if (existsSync(file)) stored = JSON.parse(readFileSync(file, 'utf-8'));
  } catch { /* 柜子文件坏了就当空柜,不炸 */ }
  const out = {};
  for (const [provider, envName] of Object.entries(ENV_NAMES)) {
    const v = env[envName] || stored[provider];
    if (v) out[provider] = v;
  }
  return out;
}

/** 存一把 key 进柜子(合并已有的),目录 0700、文件 0600。 */
export function saveKey(provider, key, file = DEFAULT_KEYS_FILE) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  let stored = {};
  try {
    if (existsSync(file)) stored = JSON.parse(readFileSync(file, 'utf-8'));
  } catch { /* 覆盖坏文件 */ }
  stored[provider] = key;
  writeFileSync(file, JSON.stringify(stored, null, 2) + '\n', { mode: KEYS_FILE_MODE });
  chmodSync(file, KEYS_FILE_MODE); // 已存在的文件 writeFileSync 不改权限,补一刀
}

/** 清空柜子(--forget-keys)。 */
export function forgetKeys(file = DEFAULT_KEYS_FILE) {
  rmSync(file, { force: true });
}
