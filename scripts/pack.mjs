/**
 * 发布打包：dist/ →
 *   1. pack/ai-prompt-quick-insert.crx（Chrome 签名安装包，企业策略分发用）
 *   2. pack/update_manifest.xml 版本号自动同步为 manifest 版本
 *   3. ai-prompt-quick-insert-v<版本>.zip（解压后「加载已解压的扩展程序」用）
 * 用法：npm run build && npm run pack
 * 首次运行自动生成签名密钥 wpx-extension.pem（决定扩展 ID，勿丢勿提交）。
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const keyPath = path.join(root, 'wpx-extension.pem');
const packDir = path.join(root, 'pack');

if (!existsSync(path.join(dist, 'manifest.json'))) {
  console.error('未找到 dist/，请先运行 npm run build');
  process.exit(1);
}
const version = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8')).version;

// ---- 定位 chrome.exe（--pack-extension 依赖它做 CRX3 签名） ----
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
].filter(Boolean);
const chrome = chromeCandidates.find((p) => existsSync(p));
if (!chrome) {
  console.error('未找到 chrome.exe，可用环境变量 CHROME_PATH 指定路径');
  process.exit(1);
}

// ---- 签名密钥：没有就生成（同一把钥匙 → 同一个扩展 ID，升级不换 ID） ----
if (!existsSync(keyPath)) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(keyPath, privateKey);
  console.log('已生成签名密钥 wpx-extension.pem（决定扩展 ID，勿丢勿提交）');
}

// ---- crx ----
mkdirSync(packDir, { recursive: true });
const tmpCrx = path.join(root, 'dist.crx');
if (existsSync(tmpCrx)) rmSync(tmpCrx);
try {
  execFileSync(
    chrome,
    [`--pack-extension=${dist}`, `--pack-extension-key=${keyPath}`, '--no-first-run'],
    { stdio: 'ignore' },
  );
} catch {
  // 部分 Chrome 版本打包成功但退出码非 0，以下面的产物检查为准
}
if (!existsSync(tmpCrx)) {
  console.error('crx 打包失败：chrome --pack-extension 未产出 dist.crx');
  process.exit(1);
}
const crxPath = path.join(packDir, 'ai-prompt-quick-insert.crx');
if (existsSync(crxPath)) rmSync(crxPath);
renameSync(tmpCrx, crxPath);
console.log('✓', path.relative(root, crxPath));

// ---- update_manifest.xml 版本同步（免手动改，避免漏更） ----
const updPath = path.join(packDir, 'update_manifest.xml');
if (existsSync(updPath)) {
  const xml = readFileSync(updPath, 'utf8').replace(
    /(<updatecheck[^>]*version=')[^']*(')/,
    `$1${version}$2`,
  );
  writeFileSync(updPath, xml);
  console.log('✓ update_manifest.xml version →', version);
}

// ---- zip（清理旧版本号压缩包，只留当前版本） ----
const zipName = `ai-prompt-quick-insert-v${version}.zip`;
const zipPath = path.join(root, zipName);
for (const f of readdirSync(root)) {
  if (/^ai-prompt-quick-insert-v[\d.]+\.zip$/.test(f) && f !== zipName) {
    rmSync(path.join(root, f));
  }
}
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path "${dist}" -DestinationPath "${zipPath}" -Force`,
]);
console.log('✓', path.relative(root, zipPath));
