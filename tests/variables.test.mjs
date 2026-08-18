import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVariables, usedVariables } from '../src/shared/variables.ts';

const NOW = new Date(2026, 7, 18, 9, 5); // 2026-08-18 09:05

test('静态变量：date/time/datetime', async () => {
  const { text, failed } = await resolveVariables('今天是 {{date}} {{time}} {{datetime}}', {
    now: NOW,
  });
  assert.equal(text, '今天是 2026-08-18 09:05 2026-08-18 09:05');
  assert.equal(failed.length, 0);
});

test('url/title/selection', async () => {
  const { text } = await resolveVariables('{{url}} | {{title}} | {{selection}}', {
    url: 'https://a.com/x',
    title: '页面标题',
    selection: () => '选中文字',
    now: NOW,
  });
  assert.equal(text, 'https://a.com/x | 页面标题 | 选中文字');
});

test('selection 缺省为空串（不算失败）', async () => {
  const { text, failed } = await resolveVariables('翻译：{{selection}}', { now: NOW });
  assert.equal(text, '翻译：');
  assert.equal(failed.length, 0);
});

test('clipboard 成功替换', async () => {
  const { text, failed } = await resolveVariables('翻译：{{clipboard}}', {
    clipboard: async () => 'hello',
    now: NOW,
  });
  assert.equal(text, '翻译：hello');
  assert.equal(failed.length, 0);
});

test('clipboard 失败：保留字面量并计入 failed', async () => {
  const { text, failed } = await resolveVariables('{{clipboard}}', {
    clipboard: async () => {
      throw new Error('denied');
    },
    now: NOW,
  });
  assert.equal(text, '{{clipboard}}');
  assert.deepEqual(failed, ['clipboard']);
});

test('未知变量原样保留（不算失败）', async () => {
  const { text, failed } = await resolveVariables('{{name}} 与 {{ myvar }}', { now: NOW });
  assert.equal(text, '{{name}} 与 {{ myvar }}');
  assert.equal(failed.length, 0);
});

test('无变量文本直通', async () => {
  const { text } = await resolveVariables('普通文本', {});
  assert.equal(text, '普通文本');
});

test('同一变量多次出现全部替换', async () => {
  const { text } = await resolveVariables('{{date}}/{{date}}', { now: NOW });
  assert.equal(text, '2026-08-18/2026-08-18');
});

test('usedVariables 只列出受支持的变量', () => {
  assert.deepEqual(usedVariables('{{date}} {{nope}} {{time}}'), ['date', 'time']);
});
