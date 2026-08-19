/**
 * 选项页冒烟测试：真实 Chrome + 加载 dist/ 扩展，驱动 options 页。
 * 覆盖本轮修复：dirty 确认、trim 对齐、键盘激活、保存失败可见性、在途保存焦点保持。
 * 用法：node smoke-options.mjs   （结束后自动关闭浏览器）
 */
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

const DIST = 'D:/workspace/chrome/web-ai-page-extension/dist';
const SHOTS = mkdtempSync(join(tmpdir(), 'wpx-smoke-'));

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ---- 注入：可控的存储故障（失败/延迟），只影响 options 页的 chrome.storage.sync.set ----
const INIT = `
(() => {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  // sync 和 local 都要拦：writePrompt 对 sync 失败有 local 降级兜底，只拦 sync 会"假失败"
  for (const area of ['sync', 'local']) {
    const orig = chrome.storage[area].set.bind(chrome.storage[area]);
    chrome.storage[area].set = function (items) {
      const vals = Object.values(items || {});
      const fail = vals.some(
        (v) => v && typeof v === 'object' && typeof v.name === 'string' && (window.__FAIL_NAMES || []).includes(v.name),
      );
      if (fail) {
        // sync 延迟拒绝（留出中途切换条目的窗口），local 兜底立即拒绝
        return delay(area === 'sync' ? 700 : 0).then(() => Promise.reject(new Error('注入的存储故障（测试）')));
      }
      const slow = vals.some((v) => v && typeof v === 'object' && Array.isArray(v.order)) ? (window.__SLOW_INDEX_MS || 0) : 0;
      if (slow) return delay(slow).then(() => orig(items));
      return orig(items);
    };
  }
})();
`;

const userDataDir = mkdtempSync(join(tmpdir(), 'wpx-profile-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

let dialogAction = 'dismiss';
const dialogs = [];
const pageErrors = [];

try {
  await context.addInitScript(INIT);

  // 扩展 ID：从 service worker URL 取
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', async (d) => {
    dialogs.push({ action: dialogAction, message: d.message() });
    await (dialogAction === 'accept' ? d.accept() : d.dismiss());
  });
  const optionsUrl = `chrome-extension://${extId}/src/options/index.html`;
  for (let i = 0; ; i++) {
    try {
      await page.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
      break;
    } catch (e) {
      // 扩展页偶发 "interrupted by another navigation" 竞态，重试即可
      if (i >= 2) throw e;
    }
  }
  await page.waitForSelector('.editor-panel');

  const nameInput = page.locator('.editor-panel input.input');
  const contentArea = page.locator('.editor-panel textarea');
  const saveBtn = page.locator('.editor-panel .btn-primary');
  const newBtn = page.locator('button:has-text("＋ 新建")');
  const row = (text) => page.locator('li.prompt-item', { hasText: text });
  const editorName = () => nameInput.inputValue();
  const isCleanForm = () => page.locator('.editor-panel .panel-title', { hasText: '新建 Prompt' }).count().then(Boolean);

  async function createPrompt(name, content) {
    await newBtn.click();
    await nameInput.fill(name);
    await contentArea.fill(content);
    await saveBtn.click();
    await page.waitForFunction(() => {
      const t = document.querySelector('.editor-panel .panel-title');
      const i = document.querySelector('.editor-panel input.input');
      return t?.textContent?.includes('新建') && i && i.value === '';
    }, { timeout: 5000 });
  }

  // ---------- T1 基础 CRUD：创建两条，保存后表单重置 ----------
  await createPrompt('第一条', '内容一：把这段翻译成英文');
  await createPrompt('第二条', '内容二：总结选中内容');
  const rowCount = await page.locator('li.prompt-item').count();
  report('T1 创建两条 prompt 且表单重置', rowCount === 2 && (await isCleanForm()), `rows=${rowCount}`);
  await page.screenshot({ path: `${SHOTS}/01-after-create.png` });

  // ---------- T2a trim 对齐：名称带尾随空格保存后，切换条目不应弹"未保存"确认 ----------
  await row('第一条').click();
  await nameInput.fill('带空格  ');
  await saveBtn.click();
  await page.waitForFunction(
    () => document.querySelector('.editor-panel input.input')?.value === '带空格',
    { timeout: 5000 },
  );
  const dialogsBefore = dialogs.length;
  await row('第二条').click();
  await page.waitForFunction(
    () => document.querySelector('.editor-panel input.input')?.value === '第二条',
    { timeout: 3000 },
  );
  const noSpurious = dialogs.length === dialogsBefore;
  report('T2a trim 对齐：保存后切换无弹窗', noSpurious, dialogs.length > dialogsBefore ? `意外弹窗: ${dialogs.at(-1)?.message}` : '');

  // ---------- T2b 名称展示为已入库的 trim 后值 ----------
  await row('带空格').click();
  report('T2b 重新打开显示 trim 后名称', (await editorName()) === '带空格', `name="${await editorName()}"`);

  // ---------- T2c dirty 确认：修改未保存时切换条目要弹确认，接受后切换 ----------
  await contentArea.fill('内容一：改一下再试');
  dialogAction = 'accept';
  await row('第二条').click();
  await page.waitForFunction(
    () => document.querySelector('.editor-panel input.input')?.value === '第二条',
    { timeout: 3000 },
  );
  dialogAction = 'dismiss';
  const confirmShown = dialogs.slice(dialogsBefore).some((d) => d.message.includes('尚未保存'));
  report('T2c 未保存修改切换时弹确认且接受后切换', confirmShown, dialogs.slice(dialogsBefore).map((d) => d.message).join(' | '));

  // ---------- T3 键盘可达：聚焦行后 Enter 进入编辑 ----------
  await row('带空格').evaluate((el) => el.focus());
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.editor-panel input.input')?.value === '带空格',
    { timeout: 3000 },
  );
  report('T3 键盘 Enter 激活行编辑', (await editorName()) === '带空格');

  // ---------- T4 保存失败可见性：保存途中切到别的条目，失败信息仍显示在当前表单 ----------
  await page.evaluate(() => (window.__FAIL_NAMES = ['故障A']));
  await newBtn.click();
  await nameInput.fill('故障A');
  await contentArea.fill('这条会保存失败');
  await saveBtn.click();
  await row('第二条').click(); // 保存 in-flight 期间切换（内容与快照一致，不应弹窗）
  await page.waitForTimeout(1400); // 等注入的延迟 reject 到达
  const errText = (await page.locator('.form-error').textContent()) ?? '';
  const showingB = (await editorName()) === '第二条';
  report('T4 保存失败提示在切换后的表单上可见', errText.includes('注入的存储故障') && showingB, `err="${errText.trim()}" name="${await editorName()}"`);
  await page.screenshot({ path: `${SHOTS}/02-error-visible.png` });
  await page.evaluate(() => (window.__FAIL_NAMES = []));

  // ---------- T5 在途保存焦点保持：慢速索引写入期间继续输入，不被重渲染打断 ----------
  await page.evaluate(() => (window.__SLOW_INDEX_MS = 1500));
  await newBtn.click();
  await nameInput.fill('慢速C');
  await contentArea.fill('内容C');
  await contentArea.evaluate((el) => el.focus()); // 先聚焦输入框
  await saveBtn.evaluate((el) => el.click()); // 程序化点击不动焦点
  await page.keyboard.type('追加'); // 索引写入延迟期间继续打字
  const midSaveFocused = await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
  await page.waitForTimeout(1800); // 等保存收尾（收尾 render 会换节点，焦点按预期丢失）
  const finalValue = await contentArea.inputValue();
  report('T5 在途保存期间焦点保持、输入不丢', midSaveFocused && finalValue.includes('追加'), `midFocused=${midSaveFocused} value="${finalValue}"`);
  await page.evaluate(() => (window.__SLOW_INDEX_MS = 0));
  await page.screenshot({ path: `${SHOTS}/03-final.png` });

  report('无意外页面错误', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  report('驱动执行', false, String(e));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过；截图目录 ${SHOTS} =====`);
  await context.close();
  process.exit(failed.length ? 1 : 0);
}
