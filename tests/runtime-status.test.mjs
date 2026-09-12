import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/core/sidepanel.js', import.meta.url), 'utf8');
const listeners = new Map();
const sessionStore = new Map();
const context = vm.createContext({
    console,
    Date,
    Math,
    Set,
    navigator: { language: 'zh-CN', languages: ['zh-CN'], clipboard: { writeText: async () => {} } },
    window: { location: { search: '' }, addEventListener: (name, listener) => listeners.set(name, listener) },
    document: { documentElement: {}, querySelectorAll: () => [], getElementById: () => null },
    chrome: {
        runtime: { getManifest: () => ({ version: '2.1.5' }) },
        tabs: {},
        scripting: {},
        storage: {
            session: {
                set: async value => { Object.entries(value).forEach(([key, item]) => sessionStore.set(key, item)); },
                get: async key => ({ [key]: sessionStore.get(key) }),
                remove: async key => { sessionStore.delete(key); }
            }
        }
    }
});
vm.runInContext(source, context);

const evaluate = expression => vm.runInContext(expression, context);
const status = value => evaluate(`makeRuntimeStatus(${JSON.stringify(value)})`);

const ready = status({
    url: 'https://chatgpt.com/c/example',
    diagnostics: { platform: 'CHATGPT', stats: { questions: 2, answers: 2 } },
    outline: [{ type: 'question' }, { type: 'answer' }]
});
assert.equal(ready.status, 'ready');
assert.equal(ready.questionsIndexed, 2);
assert.equal(ready.answersIndexed, 2);
assert.equal(evaluate(`statusNeedsAttention(${JSON.stringify(ready)})`), false);

const doubao = status({
    url: 'https://www.doubao.com/chat/example',
    diagnostics: { platform: 'DOUBAO', stats: { questions: 3, answers: 2 } },
    outline: [{ type: 'question' }]
});
assert.equal(doubao.status, 'partial');
assert.equal(doubao.adapterStatus, 'passive-indexing');
assert.match(doubao.detail, /当前仅显示已加载内容/);
assert.equal(evaluate(`statusNeedsAttention(${JSON.stringify(doubao)})`), true);

const empty = status({ url: 'https://chatgpt.com/', diagnostics: { stats: { questions: 0, answers: 0 } } });
assert.equal(empty.status, 'no-conversation');

const failed = status({ url: 'https://chatgpt.com/c/example', error: { code: 'injection-failed' } });
assert.equal(failed.status, 'failed');
assert.equal(failed.errorCode, 'injection-failed');
assert.equal(evaluate(`statusNeedsAttention(${JSON.stringify(failed)})`), true);

const unsupported = status({ url: 'https://example.com/' });
assert.equal(unsupported.status, 'unsupported');
assert.equal(unsupported.pageDetected, false);

const diagnostic = evaluate(`diagnosticText(${JSON.stringify(ready)})`);
assert.match(diagnostic, /Questions indexed: 2/);
assert.doesNotMatch(diagnostic, /chatgpt\.com|example|conversation text|URL:/i);

await evaluate(`currentTabId = 42; runtimeStatus = ${JSON.stringify(ready)}; currentOutlineData = [{ id: 'a-q1', type: 'question', text: 'Tab A question' }]; persistPanelState();`);
await evaluate(`currentTabId = 43; runtimeStatus = ${JSON.stringify(doubao)}; currentOutlineData = [{ id: 'b-q1', type: 'question', text: 'Tab B question' }]; persistPanelState();`);
const retained = await evaluate('getRetainedPanelState(42)');
const retainedB = await evaluate('getRetainedPanelState(43)');
assert.equal(retained.runtimeStatus.status, 'refreshing');
assert.equal(retained.runtimeStatus.questionsIndexed, 2);
assert.equal(retained.outline[0].text, 'Tab A question');
assert.equal(retainedB.outline[0].text, 'Tab B question');
assert.doesNotMatch(JSON.stringify(sessionStore.get('aiChatExporterRuntimeStatus:42').runtimeStatus), /chatgpt\.com|example|URL:/i);
await evaluate('clearRetainedRuntimeStatus(42)');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(sessionStore.has('aiChatExporterRuntimeStatus:42'), false);
assert.equal(sessionStore.has('aiChatExporterRuntimeStatus:43'), true);

console.log('runtime status model ok');
