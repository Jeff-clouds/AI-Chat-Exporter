import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridgeSource = fs.readFileSync(new URL('../src/core/chatgpt-api-bridge.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../src/core/conversation-index.js', import.meta.url), 'utf8');
const backgroundSource = fs.readFileSync(new URL('../src/core/background.js', import.meta.url), 'utf8');
const contentSource = fs.readFileSync(new URL('../src/core/content.js', import.meta.url), 'utf8');
const sidepanelSource = fs.readFileSync(new URL('../src/core/sidepanel.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

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
assert.match(indexSource, /CHATGPT_CACHE_TTL_MS = 15000/);
assert.match(indexSource, /ai-chat-index-updated/);
assert.match(bridgeSource, /backend-api\/conversation\/\$\{encodeURIComponent\(conversationId\)\}/);
assert.doesNotMatch(bridgeSource, /limit=100000/);
assert.match(bridgeSource, /API_REQUEST_TIMEOUT_MS = 8000/);
assert.match(bridgeSource, /CHATGPT_CACHE_TTL_MS = 15000/);
assert.match(bridgeSource, /window\.fetch = function interceptedFetch/);
assert.equal(manifest.content_scripts?.[0]?.run_at, 'document_start');
assert.equal(manifest.content_scripts?.[0]?.world, 'MAIN');
assert.match(manifest.content_scripts?.[0]?.js?.[0] || '', /chatgpt-api-bridge\.js/);
assert.match(indexSource, /scanChatGptDom\(\{ cacheMessages: true \}\)/);
assert.match(indexSource, /observeChatGpt\(\)/);
assert.match(indexSource, /scheduleChatGptScan/);
assert.match(indexSource, /MAX_MOUNTED_CHATGPT_TURNS = 48/);
assert.match(indexSource, /\[data-message-author-role\]/);
const pipelineSource = fs.readFileSync(new URL('../src/core/pipeline.js', import.meta.url), 'utf8');
assert.match(pipelineSource, /if \(this\.platformId === 'CHATGPT'\)[\s\S]*?await index\.refresh\(\{ observe: true, awaitApi: false \}\)/);
assert.match(pipelineSource, /if \(this\.platformId === 'CHATGPT'\) return \{ outline: \[\], diagnostics \}/);
assert.match(contentSource, /if \(outlineExtraction\) \{[\s\S]*?outlineRefreshPending = true;[\s\S]*?return outlineExtraction;/);
assert.match(contentSource, /pipeline\.platformId === 'CHATGPT' \|\| pipeline\.platformId === 'DOUBAO'/);
assert.match(contentSource, /window\.location\.href !== extractionUrl/);
assert.match(contentSource, /type: 'routeChanged', url: lastUrl/);
assert.match(contentSource, /patchHistoryMethod\('pushState'\)/);
assert.match(sidepanelSource, /message\.type === 'routeChanged'/);
assert.match(sidepanelSource, /currentTabUrl = message\.url/);
assert.match(indexSource, /routeGeneration/);
assert.match(bridgeSource, /routeEpoch/);
assert.match(bridgeSource, /activeControllers/);

// MAIN-world bridge：短 TTL 内同 ID 复用，过期、force、换 ID 重取；原生 fetch 主动推送。
{
    let fetchCount = 0;
    const fetchUrls = [];
    const postedMessages = [];
    const messageListeners = new Set();
    let now = 100_000;
    const window = {
        addEventListener(type, listener) { if (type === 'message') messageListeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'message') messageListeners.delete(listener); },
        postMessage(message, targetOrigin) { postedMessages.push({ message, targetOrigin }); }
    };
    const context = {
        window,
        location: { origin: 'https://chatgpt.com' },
        Date: { now: () => now },
        Map,
        URL,
        encodeURIComponent,
        fetch: async url => {
            fetchCount++;
            fetchUrls.push(url);
            await Promise.resolve();
            if (url.includes('failure')) throw new Error('network down');
            const payload = { mapping: {}, url };
            return { ok: true, json: async () => payload, clone: () => ({ json: async () => payload }) };
        }
    };
    vm.runInNewContext(bridgeSource, context);
    const bridge = window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__;
    const compacted = bridge.compactConversationPayload({
        title: 'compact test',
        current_node: 'terminal',
        mapping: {
            root: { id: 'root', parent: null },
            user: { id: 'user', parent: 'root', message: { id: 'u1', author: { role: 'user', extra: 'drop' }, content: { parts: ['question'] }, metadata: { drop: true } } },
            terminal: { id: 'terminal', parent: 'user' }
        }
    });
    assert.deepEqual(Object.keys(compacted.mapping).sort(), ['root', 'terminal', 'user']);
    assert.equal(compacted.mapping.user.message.author.extra, undefined, 'bridge must discard non-export message metadata');
    assert.equal(compacted.mapping.terminal.message, undefined, 'non-message current node must remain traversable');
    await window.fetch('/backend-api/conversation/native-response');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(bridge.payloads.has('native-response'), true, 'native page fetch must populate the bridge cache');
    const nativePush = postedMessages.find(entry =>
        entry.message?.source === 'ai-chat-export-pro' &&
        entry.message?.type === 'chatgpt-conversation' &&
        entry.message?.conversationId === 'native-response'
    );
    assert.ok(nativePush, 'native page fetch must proactively publish the captured conversation');
    assert.equal(nativePush.message.requestId, undefined, 'unsolicited native payload must not impersonate a requested response');
    assert.equal(nativePush.targetOrigin, 'https://chatgpt.com');
    fetchCount = 0;
    fetchUrls.length = 0;
    await Promise.all([bridge.loadConversation('same'), bridge.loadConversation('same')]);
    assert.equal(fetchCount, 1, 'concurrent same-id bridge requests must coalesce');
    assert.equal(fetchUrls[0], '/backend-api/conversation/same', 'bridge must use the standard single-conversation endpoint');
    await bridge.loadConversation('same');
    assert.equal(fetchCount, 1, 'fresh same-id cache entry must not refetch');
    now += 15_001;
    await bridge.loadConversation('same');
    assert.equal(fetchCount, 2, 'expired same-id cache entry must refetch');
    await bridge.loadConversation('same', true);
    assert.equal(fetchCount, 3, 'explicit force must refresh');
    await bridge.loadConversation('another');
    assert.equal(fetchCount, 4, 'a new conversation id must fetch');
    await bridge.loadConversation('third');
    assert.equal(fetchCount, 5, 'another new conversation id must fetch');
    assert.equal(bridge.payloads.size, 2, 'bridge must retain only the two most recent conversations');
    const beforeGenerationFetches = fetchCount;
    await Promise.all([
        bridge.loadConversation('same-generation-test', true, 'request-one'),
        bridge.loadConversation('same-generation-test', true, 'request-two')
    ]);
    assert.equal(fetchCount, beforeGenerationFetches + 2, 'different request generations must not reuse an older in-flight response');
    await assert.rejects(bridge.loadConversation('failure'));
    await assert.rejects(bridge.loadConversation('failure'));
    assert.equal(fetchCount, beforeGenerationFetches + 3, 'failed request must be cooled down');
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

// ChatGPT：会话根 observer + capture scroll 都会自动增量扫描并通知。
// 随后到达的较旧 API payload 只能升级已知记录，不能擦掉 DOM-only 新 turn。
{
    let turns = [];
    const scheduled = new Map();
    let nextTimerId = 1;
    const observers = [];
    const dispatched = [];
    const windowListeners = [];
    const flushTimers = () => {
        while (scheduled.size > 0) {
            const batch = Array.from(scheduled.entries());
            scheduled.clear();
            batch.forEach(([, callback]) => callback());
        }
    };
    const makeHeading = (level, text) => ({ tagName: level.toUpperCase(), textContent: text });
    const makeTurn = (role, number, id, text, headings = []) => ({
        textContent: text,
        getAttribute(name) {
            if (name === 'data-turn') return role;
            if (name === 'data-testid') return `conversation-turn-${number}`;
            if (name === 'data-turn-id') return id;
            return '';
        },
        querySelectorAll: selector => selector === 'h1,h2,h3,h4,h5,h6' ? headings : []
    });
    const conversationRoot = {
        querySelectorAll: selector => selector === '[data-turn]' || selector === '[data-testid^="conversation-turn-"][data-turn]'
            ? turns
            : []
    };
    const body = { name: 'body' };
    const window = {
        addEventListener(type, listener, options) { windowListeners.push({ type, listener, options }); },
        removeEventListener(type, listener) {
            const index = windowListeners.findIndex(item => item.type === type && item.listener === listener);
            if (index >= 0) windowListeners.splice(index, 1);
        },
        dispatchEvent(event) { dispatched.push(event.type); },
        postMessage() {}
    };
    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.target = null;
            this.options = null;
            observers.push(this);
        }
        observe(target, options) {
            this.target = target;
            this.options = options;
        }
        disconnect() {}
    }
    const context = {
        window,
        location: { href: 'https://chatgpt.com/c/incremental', pathname: '/c/incremental', origin: 'https://chatgpt.com' },
        document: {
            title: '',
            querySelector: selector => (selector === 'main' || selector === '[role="main"]')
                ? conversationRoot
                : null,
            body
        },
        MutationObserver: FakeMutationObserver,
        setTimeout(callback) {
            const id = nextTimerId++;
            scheduled.set(id, callback);
            return id;
        },
        clearTimeout(id) { scheduled.delete(id); },
        CustomEvent: class { constructor(type) { this.type = type; } },
        console
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    index.resetForLocation();
    index.observeChatGpt();
    assert.equal(observers.length, 1, 'ChatGPT must install one conversation-scoped observer');
    assert.equal(observers[0].target, conversationRoot, 'ChatGPT observer must target the conversation root');
    assert.notEqual(observers[0].target, body, 'ChatGPT observer must never watch document.body');

    turns = [
        makeTurn('user', 1, 'u1', 'first'),
        makeTurn('assistant', 2, 'a1', 'first answer', [makeHeading('h2', 'first heading')])
    ];
    observers[0].callback([{ type: 'childList' }]);
    flushTimers();
    assert.equal(index.records.has('a1'), true, 'mutation must automatically scan mounted turns');
    assert.deepEqual(Array.from(index.getChatGptDomHeadings(2, 'a1'), heading => heading.text), ['first heading']);
    assert.ok(dispatched.includes('ai-chat-index-updated'), 'mutation scan must notify the outline lifecycle');

    dispatched.length = 0;
    turns = [
        makeTurn('user', 3, 'u2', 'second'),
        makeTurn('assistant', 4, 'a2', 'second answer', [makeHeading('h3', 'second heading')])
    ];
    const captureScroll = windowListeners.find(item =>
        item.type === 'scroll' && (item.options === true || item.options?.capture === true)
    );
    assert.ok(captureScroll, 'ChatGPT must listen for capture-phase scrolls from nested scrollers');
    captureScroll.listener({ type: 'scroll', target: conversationRoot });
    flushTimers();
    assert.equal(index.records.has('a2'), true, 'scroll must automatically scan the newly mounted virtual window');
    assert.deepEqual(Array.from(index.getChatGptDomHeadings(4, 'a2'), heading => heading.text), ['second heading']);
    assert.ok(dispatched.includes('ai-chat-index-updated'), 'scroll scan must notify the outline lifecycle');

    index.importChatGptPayload({
        current_node: 'a1',
        mapping: {
            root: { id: 'root', parent: null },
            u1: { id: 'u1', parent: 'root', message: { id: 'u1', author: { role: 'user' }, content: { parts: ['first'] } } },
            a1: { id: 'a1', parent: 'u1', message: { id: 'a1', author: { role: 'assistant' }, content: { parts: ['# preserved markdown'] } } }
        }
    });
    const unified = index.toUnifiedData();
    assert.equal(unified.conversations.length, 2);
    assert.equal(unified.conversations[0].answer.content, '# preserved markdown');
    assert.equal(unified.conversations[1].question, 'second', 'older API payload must retain the DOM-only user turn');
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
