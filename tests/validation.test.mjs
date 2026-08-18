import test from 'node:test';
import assert from 'node:assert/strict';
import {
  urlToPatterns,
  validatePromptInput,
  validateSiteInput,
} from '../src/shared/types.ts';

const base = {
  inputSelectors: [],
  anchorMode: 'auto',
  buttonOffset: { right: -48, down: -6 },
  enabled: true,
};

test('urlToPatterns：www 自动附带裸域变体', () => {
  assert.deepEqual(urlToPatterns('https://www.kimi.com/chat'), {
    matchPatterns: ['https://www.kimi.com/*', 'https://kimi.com/*'],
    hostnames: ['www.kimi.com', 'kimi.com'],
  });
});

test('urlToPatterns：非法输入返回 null', () => {
  assert.equal(urlToPatterns('notaurl'), null);
  assert.equal(urlToPatterns('ftp://a.com'), null);
  assert.equal(urlToPatterns('https://'), null);
});

test('站点：域名冲突被拒绝', () => {
  const err = validateSiteInput({ ...base, name: 'x', url: 'https://a.com' }, ['a.com']);
  assert.match(err, /已存在/);
});

test('站点：自定义锚定必须填选择器', () => {
  const err = validateSiteInput(
    { ...base, name: 'x', url: 'https://b.com', anchorMode: 'selector' },
    [],
  );
  assert.match(err, /锚定/);
});

test('站点：合法输入通过', () => {
  assert.equal(validateSiteInput({ ...base, name: 'x', url: 'https://b.com' }, []), null);
});

test('站点：名称为空被拒绝', () => {
  assert.match(validateSiteInput({ ...base, name: '  ', url: 'https://b.com' }, []), /名称/);
});

test('prompt：名称为空被拒绝', () => {
  assert.match(
    validatePromptInput({ name: ' ', content: 'x', position: 'append' }),
    /名称/,
  );
});

test('prompt：超长被拒绝', () => {
  assert.match(
    validatePromptInput({ name: 'n'.repeat(51), content: 'c', position: 'append' }),
    /50/,
  );
});

test('prompt：合法输入通过', () => {
  assert.equal(validatePromptInput({ name: 'n', content: 'c', position: 'prepend' }), null);
});
