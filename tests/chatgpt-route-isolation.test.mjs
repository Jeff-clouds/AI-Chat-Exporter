import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const indexSource = fs.readFileSync(new URL('../src/core/conversation-index.js', import.meta.url), 'utf8');
const sidepanelSource = fs.readFileSync(new URL('../src/core/sidepanel.js', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../src/core/chatgpt-api-bridge.js', import.meta.url), 'utf8');

function makeHeading(level, text) {
    return { tagName: level.toUpperCase(), textContent: text };
}

function makeTurn(role, number, id, text, headings = []) {
    return {
        textContent: text,
        getAttribute(name) {
            if (name === 'data-turn') return role;
            if (name === 'data-testid') return `conversation-turn-${number}`;
            if (name === 'data-turn-id') return id;
            return '';
        },
        querySelectorAll(selector) {
            return selector === 'h1,h2,h3,h4,h5,h6' ? headings : [];
        }
    };
}

function makeSectionMessage(role, number, sectionId, messageId, text, headings = []) {
    const section = {
        getAttribute(name) {
            if (name === 'data-testid') return `conversation-turn-${number}`;
            if (name === 'data-turn-id') return sectionId;
            return '';
        }
    };
    return {
        textContent: text,
        getAttribute(name) {
            if (name === 'data-message-author-role') return role;
            if (name === 'data-message-id') return messageId;
            return '';
        },
        closest(selector) {
            return selector === '[data-testid^="conversation-turn-"]' ? section : null;
        },
        querySelectorAll(selector) {
            return selector === 'h1,h2,h3,h4,h5,h6' ? headings : [];
        }
    };
}

// Current ChatGPT uses SECTION conversation turns. The role/API message ID live
// on descendants, and one assistant SECTION may contain progress + final nodes.
{
    const location = {
        href: 'https://chatgpt.com/c/current-section-dom',
        pathname: '/c/current-section-dom',
        origin: 'https://chatgpt.com'
    };
    const messages = [
        makeSectionMessage('user', 31, 'section-u', 'api-u', 'Current question'),
        makeSectionMessage('assistant', 32, 'section-a', 'api-progress', 'Working'),
        makeSectionMessage('assistant', 32, 'section-a', 'api-final', 'Final answer', [makeHeading('h2', 'Current DOM heading')])
    ];
    const root = {
        querySelectorAll(selector) {
            if (selector === '[data-turn]') return [];
            if (selector === '[data-message-author-role]') return messages;
            return [];
        }
    };
    const window = {
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        postMessage() {}
    };
    const context = {
        window,
        location,
        document: {
            title: 'Current ChatGPT DOM',
            querySelector(selector) {
                return selector === 'main' || selector === '[role="main"]' ? root : null;
            }
        },
        MutationObserver: class { disconnect() {} },
        setTimeout,
        clearTimeout,
        CustomEvent: class {},
        console
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    index.resetForLocation();
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), true);
    assert.deepEqual(Array.from(index.getMessages(), message => message.id), ['api-u', 'api-progress', 'api-final']);
    assert.deepEqual(
        Array.from(index.getChatGptDomHeadings(32, 'api-final'), item => item.text),
        ['Current DOM heading'],
        'final answer headings must be keyed by the descendant API message ID'
    );
    assert.deepEqual(
        Array.from(index.getChatGptDomHeadings(32), item => item.text),
        ['Current DOM heading'],
        'turn fallback remains available only when no authoritative message ID exists'
    );
}

// A native ChatGPT fetch that spans A→B→A is stale even though its starting and
// ending URLs match. The main-world route epoch must suppress that unsolicited push.
{
    const location = {
        href: 'https://chatgpt.com/c/native-a',
        pathname: '/c/native-a',
        origin: 'https://chatgpt.com'
    };
    const posted = [];
    const fetchResolvers = [];
    const updateLocation = rawUrl => {
        const url = new URL(rawUrl, location.origin);
        location.href = url.href;
        location.pathname = url.pathname;
    };
    const window = {
        addEventListener() {},
        removeEventListener() {},
        postMessage(message) { posted.push(message); },
        history: {
            pushState(_state, _title, url) { updateLocation(url); },
            replaceState(_state, _title, url) { updateLocation(url); }
        }
    };
    const context = {
        window,
        location,
        URL,
        Map,
        encodeURIComponent,
        setTimeout,
        clearTimeout,
        console,
        fetch() {
            return new Promise(resolve => fetchResolvers.push(resolve));
        }
    };
    vm.runInNewContext(bridgeSource, context);
    const staleNativeRequest = window.fetch('/backend-api/conversation/native-a');
    window.history.pushState({}, '', '/c/native-b');
    window.history.pushState({}, '', '/c/native-a');
    fetchResolvers.shift()({
        ok: true,
        clone() { return { json: async () => ({ current_node: 'root', mapping: { root: { id: 'root', parent: null } } }) }; }
    });
    await staleNativeRequest;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__.payloads.has('native-a'), false);
    assert.equal(posted.some(message => message.conversationId === 'native-a'), false, 'cross-generation native A must not be pushed after A→B→A');

    const freshNativeRequest = window.fetch('/backend-api/conversation/native-a');
    fetchResolvers.shift()({
        ok: true,
        clone() { return { json: async () => ({ current_node: 'root', mapping: { root: { id: 'root', parent: null } } }) }; }
    });
    await freshNativeRequest;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__.payloads.has('native-a'), true);
    assert.equal(posted.some(message => message.conversationId === 'native-a'), true, 'fresh current-generation native A may update the index');
}

// Releasing A intentionally aborts its direct request. That cancellation must not
// create a failure cooldown that prevents an immediate fresh A request.
{
    class FakeAbortController {
        constructor() {
            this.signal = { onabort: null };
        }
        abort() {
            this.signal.onabort?.();
        }
    }
    const location = {
        href: 'https://chatgpt.com/c/abort-a',
        pathname: '/c/abort-a',
        origin: 'https://chatgpt.com'
    };
    const listeners = new Map();
    let fetchCount = 0;
    const window = {
        addEventListener(type, listener) { listeners.set(type, listener); },
        removeEventListener() {},
        postMessage() {}
    };
    const response = {
        ok: true,
        async json() { return { current_node: 'root', mapping: { root: { id: 'root', parent: null } } }; }
    };
    const context = {
        window,
        location,
        URL,
        Map,
        AbortController: FakeAbortController,
        encodeURIComponent,
        setTimeout,
        clearTimeout,
        console,
        fetch(_url, options = {}) {
            fetchCount++;
            if (fetchCount > 1) return Promise.resolve(response);
            return new Promise((_resolve, reject) => {
                options.signal.onabort = () => {
                    const error = new Error('aborted');
                    error.name = 'AbortError';
                    reject(error);
                };
            });
        }
    };
    vm.runInNewContext(bridgeSource, context);
    const bridge = window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__;
    const abortedLoad = bridge.loadConversation('abort-a', true, 'first-generation');
    listeners.get('message')({
        source: window,
        origin: location.origin,
        data: { source: 'ai-chat-exporter-index', type: 'chatgpt-conversation-release' }
    });
    await assert.rejects(abortedLoad);
    await bridge.loadConversation('abort-a', false, 'second-generation');
    assert.equal(fetchCount, 2, 'intentional release abort must allow an immediate fresh request');
}

// ChatGPT changes the URL before React replaces the old conversation DOM. A shorter
// conversation B must never inherit A's records or headings during that transition.
{
    const location = {
        href: 'https://chatgpt.com/c/conversation-a',
        pathname: '/c/conversation-a',
        origin: 'https://chatgpt.com'
    };
    const aTurns = [
        makeTurn('user', 1, 'a-u1', 'A question one'),
        makeTurn('assistant', 2, 'a-a1', 'A answer one', [makeHeading('h2', 'A heading one')]),
        makeTurn('user', 3, 'a-u2', 'A question two'),
        makeTurn('assistant', 4, 'a-a2', 'A answer two', [makeHeading('h3', 'A heading two')])
    ];
    let turns = aTurns;
    const root = {
        querySelectorAll(selector) {
            return selector === '[data-turn]' ? turns : [];
        }
    };
    const window = {
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        postMessage() {}
    };
    const context = {
        window,
        location,
        document: {
            title: 'Conversation A',
            querySelector(selector) {
                return selector === 'main' || selector === '[role="main"]' ? root : null;
            }
        },
        MutationObserver: class { disconnect() {} },
        setTimeout,
        clearTimeout,
        CustomEvent: class {},
        console
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    index.resetForLocation();
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), true);
    assert.deepEqual(Array.from(index.getMessages(), message => message.id), ['a-u1', 'a-a1', 'a-u2', 'a-a2']);
    assert.deepEqual(Array.from(index.getChatGptDomHeadings(2, 'a-a1'), item => item.text), ['A heading one']);

    // The side panel disconnects its old lifecycle before reinjecting on the new route.
    // This must retain A's mounted identities even though the record cache is cleared.
    index.disconnect();
    location.href = 'https://chatgpt.com/c/conversation-b';
    location.pathname = '/c/conversation-b';
    index.connect();
    index.resetForLocation();

    assert.equal(index.scanChatGptDom({ cacheMessages: true }), false, 'old A DOM must be rejected under B URL');
    assert.equal(index.getMessages().length, 0);
    assert.equal(index.getChatGptDomHeadings(2, 'a-a1').length, 0);

    const bTurns = [
        makeTurn('user', 1, 'b-u1', 'B short question'),
        makeTurn('assistant', 2, 'b-a1', 'B short answer', [makeHeading('h2', 'B only heading')])
    ];
    turns = [...turns, ...bTurns];
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), true, 'new B nodes may be indexed while old A nodes remain mounted');
    assert.deepEqual(Array.from(index.getMessages(), message => message.id), ['b-u1', 'b-a1']);
    assert.deepEqual(Array.from(index.getChatGptDomHeadings(2, 'b-a1'), item => item.text), ['B only heading']);
    assert.equal(index.getChatGptDomHeadings(2, 'a-a1').length, 0);

    index.importChatGptPayload({
        title: 'Conversation B',
        current_node: 'b-a1',
        mapping: {
            root: { id: 'root', parent: null },
            'b-u1': {
                id: 'b-u1',
                parent: 'root',
                message: { id: 'b-u1', author: { role: 'user' }, content: { parts: ['B short question'] } }
            },
            'b-a1': {
                id: 'b-a1',
                parent: 'b-u1',
                message: { id: 'b-a1', author: { role: 'assistant' }, content: { parts: ['## B only heading'] } }
            }
        }
    });
    assert.deepEqual(Array.from(index.getMessages(), message => message.id), ['b-u1', 'b-a1']);
    assert.deepEqual(
        Array.from(index.lastChatGptTurnIdentities).sort(),
        ['id:b-a1', 'id:b-u1'],
        'confirmed B API identities must replace excluded A identities for the next route change'
    );
    assert.deepEqual(
        Array.from(index.getChatGptDomHeadings(2, 'b-a1'), item => item.text),
        ['B only heading'],
        'B headings mounted before API confirmation must survive the authoritative message import'
    );
    assert.equal(index.toUnifiedData().conversations.length, 1, 'short B must remain one conversation pair');
    assert.equal(index.toUnifiedData().conversations.some(pair => pair.question.startsWith('A ')), false);

    index.excludedChatGptTurnIdentities.clear();
    index.chatGptDomRouteTrusted = false;
    turns = aTurns;
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), false, 'without previous A identities, old DOM still needs a canonical B anchor');
    assert.equal(index.getMessages().some(message => message.id.startsWith('a-')), false);
    const bNewTurns = [
        makeTurn('user', 3, 'b-u2', 'B new question'),
        makeTurn('assistant', 4, 'b-a2', 'B new answer', [makeHeading('h3', 'B new heading')])
    ];
    turns = [...aTurns, ...bTurns, ...bNewTurns];
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), true, 'B canonical anchor may admit later B-only DOM turns');
    assert.equal(index.getMessages().some(message => message.id.startsWith('a-')), false, 'nodes before the first B anchor must be discarded');
    assert.equal(index.records.has('b-u2'), true);
    assert.equal(index.records.has('b-a2'), true);
    turns = [
        makeTurn('user', 5, 'b-u3', 'B scrolled question'),
        makeTurn('assistant', 6, 'b-a3', 'B scrolled answer', [makeHeading('h3', 'B scrolled heading')])
    ];
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), true, 'once anchored to B, later virtual scroll windows may append without repeating the anchor');
    assert.equal(index.records.has('b-u3'), true);
    assert.equal(index.records.has('b-a3'), true);

    index.records.clear();
    index.order = [];
    index.chatGptDomHeadings.clear();
    index.excludedChatGptTurnIdentities.clear();
    index.chatGptRouteAwaitingApiConfirmation = true;
    turns = aTurns;
    assert.equal(
        index.importChatGptPayload({ current_node: '', mapping: {} }),
        false,
        'an empty API payload must not accept the old DOM still mounted under a new URL'
    );
    assert.equal(index.chatGptRouteAwaitingApiConfirmation, true);
    assert.equal(index.getMessages().length, 0);
    index.importChatGptPayload({ current_node: '', mapping: {} });
    index.importChatGptPayload({ current_node: '', mapping: {} });
    assert.equal(index.chatGptEmptyRetryCount, 3);
    assert.equal(index.chatGptEmptyFallbackTimer, null, 'three empty responses must not unlock the route on a time guess');
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), false, 'unchanged old A identities must remain rejected after repeated empty responses');
    assert.equal(index.getMessages().length, 0);
    turns = bTurns;
    assert.equal(index.scanChatGptDom({ cacheMessages: true }), true, 'changed B identities may release the empty-payload route gate');
    assert.equal(index.chatGptRouteAwaitingApiConfirmation, false);
    assert.deepEqual(Array.from(index.getMessages(), message => message.id), ['b-u1', 'b-a1']);
}

// A requested response is valid only for the exact route generation that created it.
// Returning to the same conversation ID must not resurrect the first A request.
{
    const location = {
        href: 'https://chatgpt.com/c/repeat-a',
        pathname: '/c/repeat-a',
        origin: 'https://chatgpt.com'
    };
    const listeners = new Set();
    const posted = [];
    const window = {
        addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
        dispatchEvent() {},
        postMessage(message) { posted.push(message); }
    };
    const context = {
        window,
        location,
        document: { title: '', querySelector() { return null; } },
        MutationObserver: class {},
        setTimeout,
        clearTimeout,
        CustomEvent: class {},
        console: { ...console, warn() {} }
    };
    vm.runInNewContext(indexSource, context);
    const index = window.AI_CHAT_CONVERSATION_INDEX;
    index.resetForLocation();
    const firstALoad = index.loadChatGptApi({ force: true });
    const firstARequest = posted.find(message => message.type === 'chatgpt-conversation-request');

    location.href = 'https://chatgpt.com/c/repeat-b';
    location.pathname = '/c/repeat-b';
    index.resetForLocation();
    location.href = 'https://chatgpt.com/c/repeat-a';
    location.pathname = '/c/repeat-a';
    index.resetForLocation();
    const secondALoad = index.loadChatGptApi({ force: true });
    const requests = posted.filter(message => message.type === 'chatgpt-conversation-request');
    const secondARequest = requests[1];
    assert.notEqual(firstARequest.requestId, secondARequest.requestId);

    const oldPayload = {
        title: 'stale A',
        current_node: 'old-a',
        mapping: {
            'old-a': { id: 'old-a', parent: null, message: { id: 'old-a', author: { role: 'user' }, content: { parts: ['old A question'] } } }
        }
    };
    const newPayload = {
        title: 'fresh A',
        current_node: 'new-a',
        mapping: {
            'new-a': { id: 'new-a', parent: null, message: { id: 'new-a', author: { role: 'user' }, content: { parts: ['fresh A question'] } } }
        }
    };
    for (const listener of listeners) listener({
        source: window,
        origin: location.origin,
        data: {
            source: 'ai-chat-export-pro',
            type: 'chatgpt-conversation',
            requestId: firstARequest.requestId,
            conversationId: 'repeat-a',
            payload: oldPayload
        }
    });
    assert.equal(index.records.has('old-a'), false, 'first-generation A response must be ignored after A→B→A');

    for (const listener of listeners) listener({
        source: window,
        origin: location.origin,
        data: {
            source: 'ai-chat-export-pro',
            type: 'chatgpt-conversation',
            requestId: secondARequest.requestId,
            conversationId: 'repeat-a',
            payload: newPayload
        }
    });
    await Promise.all([firstALoad, secondALoad]);
    assert.equal(index.records.has('old-a'), false);
    assert.equal(index.records.has('new-a'), true);
    assert.equal(index.title, 'fresh A');
}

function makeElement() {
    return {
        addEventListener() {},
        appendChild() {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        dataset: {},
        removeEventListener() {},
        setAttribute() {},
        style: {}
    };
}

// URL equality is insufficient: an older extraction can finish after B already has a
// newer request for the same URL. Only the current request token may repaint the panel.
{
    let messageListener;
    const elements = new Map([['outline', { ...makeElement(), innerHTML: '' }]]);
    const context = {
        console,
        document: {
            body: makeElement(),
            createElement: makeElement,
            addEventListener() {},
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, makeElement());
                return elements.get(id);
            },
            querySelectorAll() { return []; }
        },
        navigator: { language: 'zh-CN', languages: ['zh-CN'] },
        window: { addEventListener() {}, location: { search: '' }, prompt() { return ''; } },
        setTimeout,
        clearTimeout,
        chrome: {
            runtime: {
                lastError: null,
                onMessage: { addListener(listener) { messageListener = listener; } },
                sendMessage(_message, callback) { callback?.({ success: true, status: { active: false } }); }
            },
            scripting: { async executeScript() {} },
            tabs: {
                create() {},
                connect() {
                    return { disconnect() {}, onDisconnect: { addListener() {} } };
                },
                onActivated: { addListener() {} },
                onUpdated: { addListener() {} },
                query(_options, callback) { callback([{ id: 1, url: 'https://chatgpt.com/c/conversation-b' }]); },
                async sendMessage() {}
            }
        }
    };
    vm.runInNewContext(sidepanelSource, context);
    vm.runInNewContext(`
        currentTabId = 1;
        currentTabUrl = 'https://chatgpt.com/c/conversation-b';
        currentOutlineRequestToken = 'request-b-new';
        currentOutlineData = [];
    `, context);

    const bOutline = [{ text: 'B question', type: 'question', id: 'cn-q-b', metadata: { index: 1 } }];
    messageListener({
        type: 'outline',
        outline: bOutline,
        requestToken: 'request-b-old',
        diagnostics: { url: 'https://chatgpt.com/c/conversation-b' }
    }, { tab: { id: 1, url: 'https://chatgpt.com/c/conversation-b' } });
    assert.equal(vm.runInNewContext('currentOutlineData.length', context), 0, 'stale same-URL response must be rejected');

    messageListener({
        type: 'outline',
        outline: bOutline,
        requestToken: 'request-b-new',
        diagnostics: { url: 'https://chatgpt.com/c/conversation-b' }
    }, { tab: { id: 1, url: 'https://chatgpt.com/c/conversation-b' } });
    assert.equal(vm.runInNewContext('currentOutlineData[0].text', context), 'B question');

    messageListener({
        type: 'routeChanged',
        url: 'https://chatgpt.com/c/conversation-b'
    }, { tab: { id: 1, url: 'https://chatgpt.com/c/conversation-c' } });
    assert.equal(
        vm.runInNewContext('currentTabUrl', context),
        'https://chatgpt.com/c/conversation-b',
        'a stale routeChanged event must not regress the active tab URL'
    );
    assert.equal(vm.runInNewContext('tabReloadTimer !== null', context), true, 'route mismatch must still schedule an authoritative tab re-query');
    vm.runInNewContext('clearTimeout(tabReloadTimer); tabReloadTimer = null;', context);

    vm.runInNewContext(`
        currentTabUrl = 'https://chatgpt.com/c/conversation-a';
        currentOutlineRequestToken = 'request-a';
    `, context);
    messageListener({
        type: 'routeChanged',
        url: 'https://chatgpt.com/c/conversation-b'
    }, { tab: { id: 1, url: 'https://chatgpt.com/c/conversation-a' } });
    assert.equal(vm.runInNewContext('currentOutlineRequestToken', context), '', 'a legitimate route event must invalidate A even while sender.tab.url lags');
    assert.equal(vm.runInNewContext('tabReloadTimer !== null', context), true, 'the lagging route event must still trigger a fresh tab query');
    vm.runInNewContext('clearTimeout(tabReloadTimer); tabReloadTimer = null;', context);
}

console.log('chatgpt route isolation ok');
