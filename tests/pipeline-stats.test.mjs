import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/core/pipeline.js', import.meta.url), 'utf8');
const context = {
    console,
    window: {
        location: { href: 'https://chat.deepseek.com/a/chat/s/fixture' },
        SELECTORS: { DEEPSEEK: { name: 'DeepSeek', urlPatterns: ['deepseek.com'], selectors: {}, features: {} } },
        SELECTOR_MANAGER: { getElements: () => [] }
    }
};
vm.runInNewContext(source, context);

const diagnostics = { stats: { questions: 0, answers: 0, headings: 0 } };
new context.window.Pipeline()._fillStats([
    { type: 'question', metadata: { index: 0 } },
    { type: 'answer', metadata: { answerIndex: 0 } },
    { type: 'answer', metadata: { answerIndex: 0 } },
    { type: 'question', metadata: { index: 1 } },
    { type: 'answer', metadata: { answerIndex: 1 } }
], diagnostics);

assert.deepEqual(diagnostics.stats, { questions: 2, answers: 2, headings: 3 });
console.log('pipeline answer status counts containers, not headings');
