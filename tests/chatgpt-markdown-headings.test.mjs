import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/core/pipeline.js', import.meta.url), 'utf8');
const context = {
  console,
  window: {
    location: { href: 'https://chatgpt.com/c/test' },
    SELECTORS: {
      CHATGPT: { name: 'ChatGPT', urlPatterns: ['chatgpt.com'], selectors: {}, features: {} },
      GENERIC: { name: 'Generic', selectors: {}, features: {} }
    },
    SELECTOR_MANAGER: { getElements: () => [] }
  }
};

vm.runInNewContext(source, context);
const pipeline = new context.window.Pipeline();
const headings = pipeline._indexedHeadings({
  markdown: '开场说明\n\n# 一级标题\n正文\n\n## 二级标题\n更多内容'
});

assert.deepEqual(Array.from(headings, heading => ({ text: heading.text, level: heading.level })), [
  { text: '一级标题', level: 'h1' },
  { text: '二级标题', level: 'h2' }
]);

context.window.AI_CHAT_CONVERSATION_INDEX = {
  refresh: async () => {},
  getMessages: () => [
    { id: 'u1', role: 'user', text: '问题', turnNumber: 1 },
    { id: 'a1', role: 'assistant', text: 'plain API response', markdown: 'plain API response', turnNumber: 2 }
  ],
  getChatGptDomHeadings: turnNumber => turnNumber === 2
    ? [{ text: 'DOM 中的一级标题', level: 'h1', headingIndex: 0 }, { text: 'DOM 中的二级标题', level: 'h2', headingIndex: 1 }]
    : []
};
const indexedOutline = await pipeline._extractVirtualizedOutline();
assert.deepEqual(
  Array.from(indexedOutline.filter(item => item.type === 'answer'), item => ({ text: item.text, level: item.level, headingIndex: item.metadata.headingIndex })),
  [
    { text: 'DOM 中的一级标题', level: 'h1', headingIndex: 0 },
    { text: 'DOM 中的二级标题', level: 'h2', headingIndex: 1 }
  ]
);

console.log('chatgpt markdown headings ok');
