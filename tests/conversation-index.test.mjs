import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/core/conversation-index.js', import.meta.url), 'utf8');
const context = {
  window: { addEventListener: () => {} },
  location: { href: 'https://chatgpt.com/c/test', pathname: '/c/test' },
  document: { title: '', querySelectorAll: () => [], querySelector: () => null },
  MutationObserver: class {},
  console
};
vm.runInNewContext(source, context);

const payload = {
  current_node: 'assistant-2',
  mapping: {
    root: { id: 'root', parent: null },
    user1: { id: 'user1', parent: 'root', message: { id: 'u1', author: { role: 'user' }, content: { parts: ['first question'] } } },
    assistant1: { id: 'assistant1', parent: 'user1', message: { id: 'a1', author: { role: 'assistant' }, content: { parts: ['# first answer'] } } },
    user2: { id: 'user2', parent: 'assistant1', message: { id: 'u2', author: { role: 'user' }, content: { parts: ['second question'] } } },
    'assistant-2': { id: 'assistant-2', parent: 'user2', message: { id: 'a2', author: { role: 'assistant' }, content: { parts: ['## second answer'] } } },
    abandoned: { id: 'abandoned', parent: 'assistant1', message: { id: 'bad', author: { role: 'assistant' }, content: { parts: ['wrong branch'] } } }
  }
};

const helpers = context.window.__AI_CHAT_EXPORT_TESTS__;
const index = context.window.AI_CHAT_CONVERSATION_INDEX;
assert.equal(index.version, '2026-07-14-bounded-cache');
assert.deepEqual(Array.from(helpers.currentBranchNodes(payload), node => node.id), [
  'root', 'user1', 'assistant1', 'user2', 'assistant-2'
]);
assert.equal(helpers.contentToText({ parts: ['one', { text: 'two' }] }), 'one two');
assert.equal(helpers.stripChatGptRolePrefix('你说：保留内容', 'user'), '保留内容');
assert.equal(helpers.stripChatGptRolePrefix('ChatGPT说：回答内容', 'assistant'), '回答内容');
assert.equal(helpers.stripChatGptRolePrefix('ChatGPT说这个结论仍需验证', 'assistant'), 'ChatGPT说这个结论仍需验证');
assert.equal(helpers.stripChatGptRolePrefix('ChatGPT said this was uncertain', 'assistant'), 'ChatGPT said this was uncertain');
assert.equal(helpers.stripChatGptRolePrefix('正文里的 ChatGPT说 不删除', 'assistant'), '正文里的 ChatGPT说 不删除');
assert.equal(
  helpers.contentToMarkdown({ parts: ['intro\n\n# first heading\nbody', '## second heading\nmore'] }),
  'intro\n\n# first heading\nbody\n## second heading\nmore'
);

context.window.AI_CHAT_CONVERSATION_INDEX.importChatGptPayload(payload);
const unified = context.window.AI_CHAT_CONVERSATION_INDEX.toUnifiedData();
assert.equal(unified.conversations.length, 2);
assert.equal(unified.conversations[1].question, 'second question');
assert.equal(unified.conversations[1].answer.content, '## second answer');
assert.deepEqual(Array.from(index.getMessages(), message => message.turnNumber), [1, 2, 3, 4]);

const headingPayload = {
  current_node: 'heading-assistant',
  mapping: {
    root: { id: 'root', parent: null },
    headingUser: { id: 'headingUser', parent: 'root', message: { id: 'heading-u', author: { role: 'user' }, content: { parts: ['question'] } } },
    'heading-assistant': { id: 'heading-assistant', parent: 'headingUser', message: { id: 'heading-a', author: { role: 'assistant' }, content: { parts: ['intro\n\n# H1 title\ntext\n\n## H2 title'] } } }
  }
};
index.importChatGptPayload(headingPayload);
assert.equal(index.records.get('heading-a').markdown, 'intro\n\n# H1 title\ntext\n\n## H2 title');

index.platform = 'DOUBAO';
index.records.clear();
index.order = [];
index.nextSequence = 0;
index.upsert({ id: 'later', role: 'assistant', text: 'later', offset: 900, windowIndex: 1 });
index.upsert({ id: 'first', role: 'user', text: 'first', offset: 100, windowIndex: 0 });
index.upsert({ id: 'middle', role: 'assistant', text: 'middle', offset: 500, windowIndex: 0 });
index.upsert({ id: 'middle', role: 'assistant', text: 'middle updated', offset: 500, windowIndex: 0 });
assert.deepEqual(Array.from(index.getMessages(), message => message.id), ['first', 'middle', 'later']);
assert.equal(index.getMessages().length, 3);
assert.equal(index.getMessages()[1].text, 'middle updated');

console.log('conversation index fixture ok');
