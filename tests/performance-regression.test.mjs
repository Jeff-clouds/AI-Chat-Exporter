import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridgeSource = fs.readFileSync(new URL('../src/core/chatgpt-api-bridge.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../src/core/conversation-index.js', import.meta.url), 'utf8');
const backgroundSource = fs.readFileSync(new URL('../src/core/background.js', import.meta.url), 'utf8');
const contentSource = fs.readFileSync(new URL('../src/core/content.js', import.meta.url), 'utf8');
const sidepanelSource = fs.readFileSync(new URL('../src/core/sidepanel.js', import.meta.url), 'utf8');

// ChatGPT API 只能有一个实现点，且后台不得再按安装、更新、切标签自动注入。
const allCoreSources = fs.readdirSync(new URL('../src/core/', import.meta.url))
    .filter(name => name.endsWith('.js'))
    .map(name => fs.readFileSync(new URL(`../src/core/${name}`, import.meta.url), 'utf8'))
    .join('\n');
assert.equal((allCoreSources.match(/backend-api\/conversation/g) || []).length, 1);
assert.doesNotMatch(backgroundSource, /runtime\.onInstalled|tabs\.onUpdated|tabs\.onActivated|action\.onClicked/);
assert.match(backgroundSource, /refresh\(\{ force: true, observe: false \}\)/);
assert.match(backgroundSource, /if \(!retainedByPanel\) index\.disconnect\(\)/);
assert.match(backgroundSource, /withTabExtractionLock\(tab\.id/);
assert.match(backgroundSource, /tabExtractionLocks\.delete\(tabId\)/);
assert.match(sidepanelSource, /chatgpt-api-bridge\.js/);
assert.doesNotMatch(sidepanelSource, /backend-api\/conversation/);
assert.match(sidepanelSource, /changeInfo\.status === 'complete'/);
assert.match(sidepanelSource, /scheduleReloadOutlineRequest\(\)/);
assert.match(indexSource, /CHATGPT_REQUEST_TIMEOUT_MS = 20000/);
assert.match(indexSource, /ai-chat-index-updated/);

// MAIN-world bridge：并发同 ID、连续同 ID 都只 fetch 一次；force、换 ID 才重取；失败进入冷却。
{
    let fetchCount = 0;
    const messageListeners = new Set();
    const window = {
        addEventListener(type, listener) { if (type === 'message') messageListeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'message') messageListeners.delete(listener); }
    };
    const context = {
        window,
        location: { origin: 'https://chatgpt.com' },
        Date,
        Map,
        encodeURIComponent,
        fetch: async url => {
            fetchCount++;
            await Promise.resolve();
            if (url.includes('failure')) throw new Error('network down');
            return { ok: true, json: async () => ({ mapping: {}, url }) };
        }
    };
    vm.runInNewContext(bridgeSource, context);
    const bridge = window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__;
    await Promise.all([bridge.loadConversation('same'), bridge.loadConversation('same')]);
    assert.equal(fetchCount, 1, 'concurrent same-id bridge requests must coalesce');
    await bridge.loadConversation('same');
    assert.equal(fetchCount, 1, 'cached same-id bridge request must not refetch');
    await bridge.loadConversation('same', true);
    assert.equal(fetchCount, 2, 'explicit force must refresh');
    await bridge.loadConversation('another');
    assert.equal(fetchCount, 3, 'a new conversation id must fetch');
    await bridge.loadConversation('third');
    assert.equal(fetchCount, 4, 'another new conversation id must fetch');
    assert.equal(bridge.payloads.size, 2, 'bridge must retain only the two most recent conversations');
    await assert.rejects(bridge.loadConversation('failure'));
    await assert.rejects(bridge.loadConversation('failure'));
    assert.equal(fetchCount, 5, 'failed request must be cooled down');
    for (const listener of messageListeners) listener({
        source: window,
        origin: 'https://chatgpt.com',
        data: { source: 'ai-chat-exporter-index', type: 'chatgpt-conversation-release' }
    });
    assert.equal(bridge.payloads.size, 0, 'closing the panel must release cached conversation payloads');
}

// Isolated-world index：两个 refresh 请求复用同一个 bridge request，并缓存响应。
{
    const messageListeners = new Set();
    const posted = [];
    const location = { href: 'https://chatgpt.com/c/one', pathname: '/c/one', origin: 'https://chatgpt.com' };
    const window = {
        addEventListener(type, listener) { if (type === 'message') messageListeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'message') messageListeners.delete(listener); },
        postMessage(message) { posted.push(message); }
    };
    const context = {
        window,
        location,
        document: { title: '', querySelectorAll: () => [], querySelector: () => null },
        MutationObserver: class {},
        setTimeout,
        clearTimeout,
        CustomEvent: class {},
        console
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    const first = index.loadChatGptApi();
    const duplicate = index.loadChatGptApi();
    assert.equal(posted.length, 1);
    const payload = { current_node: 'root', mapping: { root: { id: 'root', parent: null } } };
    for (const listener of messageListeners) listener({
        source: window,
        origin: location.origin,
        data: { source: 'ai-chat-export-pro', type: 'chatgpt-conversation', requestId: posted[0].requestId, conversationId: 'one', payload }
    });
    await Promise.all([first, duplicate]);
    await index.loadChatGptApi();
    assert.equal(posted.length, 1, 'index must reuse cached payload');

    const staleLoad = index.loadChatGptApi({ force: true });
    const staleRequest = posted[1];
    location.href = 'https://chatgpt.com/c/two';
    location.pathname = '/c/two';
    const routeLoad = index.loadChatGptApi();
    assert.equal(posted.length, 3, 'new route/conversation id must request once');
    const oldPayload = {
        title: 'old conversation',
        current_node: 'old-message',
        mapping: {
            'old-message': {
                id: 'old-message',
                parent: null,
                message: { id: 'old-message', author: { role: 'user' }, content: { parts: ['old question'] } }
            }
        }
    };
    for (const listener of messageListeners) listener({
        source: window,
        origin: location.origin,
        data: { source: 'ai-chat-export-pro', type: 'chatgpt-conversation', requestId: staleRequest.requestId, conversationId: 'one', payload: oldPayload }
    });
    await staleLoad;
    assert.equal(index.records.has('old-message'), false, 'late response from previous route must never enter current outline');
    for (const listener of messageListeners) listener({
        source: window,
        origin: location.origin,
        data: { source: 'ai-chat-export-pro', type: 'chatgpt-conversation', requestId: posted[2].requestId, conversationId: 'two', payload }
    });
    await routeLoad;
    location.href = 'https://chatgpt.com/c/three';
    location.pathname = '/c/three';
    const thirdLoad = index.loadChatGptApi();
    for (const listener of messageListeners) listener({
        source: window,
        origin: location.origin,
        data: { source: 'ai-chat-export-pro', type: 'chatgpt-conversation', requestId: posted[3].requestId, conversationId: 'three', payload }
    });
    await thirdLoad;
    assert.equal(index.chatGptPayloadCache.size, 2, 'isolated index must retain only the two most recent conversations');
    index.disconnect();
    assert.equal(index.pendingChatGptRequests.size, 0);
}

// 豆包：相同 data-message-id + 相同内容不会重复 clone/Turndown；变化后只重做该条。
{
    let cloneCount = 0;
    let mountedMessages = [];
    const messageElement = {
        textContent: 'hello',
        innerHTML: '<p>hello</p>',
        getAttribute: name => name === 'data-message-id' ? 'm1' : '',
        querySelector: () => null,
        getBoundingClientRect: () => ({ top: 10 }),
        cloneNode() {
            cloneCount++;
            return {
                textContent: this.textContent,
                innerHTML: this.innerHTML,
                querySelectorAll: () => []
            };
        }
    };
    const scroller = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) };
    mountedMessages = [messageElement];
    const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    const context = {
        window,
        location: { href: 'https://www.doubao.com/chat/one', pathname: '/chat/one', origin: 'https://www.doubao.com' },
        document: {
            title: '',
            querySelectorAll: selector => selector === '[data-message-id]' ? mountedMessages : [],
            querySelector: selector => selector.includes('scroller') ? scroller : null
        },
        MutationObserver: class {},
        setTimeout,
        clearTimeout,
        CustomEvent: class {},
        console
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    index.platform = 'DOUBAO';
    index.scanDoubaoWindow();
    index.scanDoubaoWindow();
    assert.equal(cloneCount, 1);
    messageElement.textContent = 'hello updated';
    messageElement.innerHTML = '<p>hello updated</p>';
    index.scanDoubaoWindow();
    assert.equal(cloneCount, 2);
    let observed = false;
    index.observeDoubao = () => { observed = true; };
    await index.refresh({ observe: false });
    assert.equal(observed, false, 'one-shot export refresh must not attach Doubao observers');
    assert.equal(index.observer, null);
    assert.equal(index.scrollTarget, null);
    assert.equal(index.scrollListener, null);
    assert.equal(index.doubaoScanTimer, null);

    const secondMessage = {
        ...messageElement,
        textContent: 'second mounted window',
        innerHTML: '<p>second mounted window</p>',
        getAttribute: name => name === 'data-message-id' ? 'm2' : ''
    };
    index.lastDoubaoScanAt = 0;
    mountedMessages = [messageElement];
    index.scanDoubaoThrottled();
    const clonesAfterLeadingScan = cloneCount;
    mountedMessages = [secondMessage];
    index.scanDoubaoThrottled();
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(index.records.has('m2'), true, 'trailing scan must retain an intermediate virtual window id');
    assert.equal(cloneCount, clonesAfterLeadingScan + 1, 'trailing scan must convert only the newly mounted message');
}

// ChatGPT：API 缓存不覆盖原始 Markdown，但缓存后新出现的 DOM turn 会增量进入索引。
{
    const turns = [];
    const makeTurn = (role, number, id, text) => ({
        textContent: text,
        getAttribute(name) {
            if (name === 'data-turn') return role;
            if (name === 'data-testid') return `conversation-turn-${number}`;
            if (name === 'data-turn-id') return id;
            return '';
        },
        querySelectorAll: () => []
    });
    const window = { addEventListener() {}, removeEventListener() {} };
    const context = {
        window,
        location: { href: 'https://chatgpt.com/c/incremental', pathname: '/c/incremental', origin: 'https://chatgpt.com' },
        document: { title: '', querySelectorAll: selector => selector === '[data-turn]' ? turns : [], querySelector: () => null },
        MutationObserver: class {},
        setTimeout,
        clearTimeout,
        console
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    index.importChatGptPayload({
        current_node: 'a1',
        mapping: {
            root: { id: 'root', parent: null },
            u1: { id: 'u1', parent: 'root', message: { id: 'u1', author: { role: 'user' }, content: { parts: ['first'] } } },
            a1: { id: 'a1', parent: 'u1', message: { id: 'a1', author: { role: 'assistant' }, content: { parts: ['# preserved markdown'] } } }
        }
    });
    turns.push(
        makeTurn('user', 1, 'u1', 'first flattened'),
        makeTurn('assistant', 2, 'a1', 'preserved flattened'),
        makeTurn('user', 3, 'u2', 'second'),
        makeTurn('assistant', 4, 'a2', 'second answer')
    );
    index.scanChatGptDom({ cacheMessages: false });
    const unified = index.toUnifiedData();
    assert.equal(unified.conversations.length, 2);
    assert.equal(unified.conversations[0].answer.content, '# preserved markdown');
    assert.equal(unified.conversations[1].question, 'second');
    assert.equal(unified.conversations[1].answer.content, 'second answer');
}

// Sidepanel Port 是持续扫描的唯一生命周期；cleanup 必须清 observer/timer/listener/index。
assert.match(contentSource, /ai-chat-exporter-panel/);
assert.match(contentSource, /port\.onDisconnect\.addListener/);
assert.match(contentSource, /window\.AI_CHAT_CONVERSATION_INDEX\?\.disconnect\?\.\(\)/);
assert.match(contentSource, /clearTimeout\(outlineRefreshTimer\)/);
assert.match(contentSource, /runtime\.onConnect\.removeListener/);
assert.doesNotMatch(contentSource, /mainObserver\.observe\(document\.body/);

console.log('performance regression fixtures ok');
