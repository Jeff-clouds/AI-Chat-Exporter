import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const contentSource = fs.readFileSync(new URL('../src/core/content.js', import.meta.url), 'utf8');

function createHarness(initialTurns = [], { enableRepairScroll = false } = {}) {
    const observers = [];
    const turns = [...initialTurns];
    const sentMessages = [];
    let messageListener = null;
    let outlineToken = 'jump-token';
    let repairResult = { outline: [], diagnostics: { url: 'https://chatgpt.com/c/jump-test', stats: {} } };
    const repairCalls = [];

    class FakeElement {
        constructor(turnNumber, messageId, { headings = [], onAnchorScroll = null, tagName = 'SECTION' } = {}) {
            this.turnNumber = turnNumber;
            this.messageId = messageId;
            this.headings = headings;
            this.onAnchorScroll = onAnchorScroll;
            this.tagName = tagName;
            this.parentElement = scroller;
            this.textContent = `turn ${turnNumber}`;
            this.style = { transition: '', backgroundColor: '' };
            this.clientHeight = 80;
            this.anchorScrolls = 0;
            this.rectReads = 0;
        }
        getAttribute(name) {
            if (name === 'data-testid') return `conversation-turn-${this.turnNumber}`;
            if (name === 'data-message-id') return this.messageId;
            return null;
        }
        matches(selector) { return matchesSelector(this, selector); }
        closest(selector) {
            let current = this;
            while (current) {
                if (current instanceof FakeElement && matchesSelector(current, selector)) return current;
                current = current.parentElement;
            }
            return null;
        }
        querySelector(selector) { return matchesSelector(this, selector) ? this : null; }
        querySelectorAll() { return []; }
        getBoundingClientRect() { this.rectReads++; return { top: 120, height: 80 }; }
        scrollIntoView(options) {
            this.anchorScrolls++;
            this.lastAnchorOptions = options;
            this.onAnchorScroll?.();
        }
    }

    const scroller = {
        parentElement: null,
        scrollHeight: 10_000,
        clientHeight: 720,
        scrollTop: 9_000,
        scrollCalls: [],
        scrollTo(options) {
            this.scrollCalls.push(options);
            this.scrollTop = options.top;
        },
        getBoundingClientRect() { return { top: 0, height: 720 }; }
    };

    const root = {
        parentElement: null,
        querySelector: selector => document.querySelector(selector),
        querySelectorAll: selector => document.querySelectorAll(selector)
    };

    function matchesSelector(element, selector) {
        if (selector === 'h1,h2,h3,h4,h5,h6') return /^H[1-6]$/.test(element.tagName);
        const messageMatch = selector.match(/^\[data-message-id="(.+)"\]$/);
        if (messageMatch) return element.messageId === messageMatch[1];
        const turnIdMatch = selector.match(/^\[data-turn-id="(.+)"\]$/);
        if (turnIdMatch) return element.messageId === turnIdMatch[1];
        return false;
    }

    const document = {
        body: root,
        documentElement: root,
        scrollingElement: scroller,
        getElementById() { return null; },
        elementFromPoint() { return turns[0] || null; },
        querySelector(selector) {
            if (selector === 'main') return root;
            const turnMatch = selector.match(/^\[data-testid="conversation-turn-(\d+)"\]$/);
            if (turnMatch) return turns.find(turn => turn.turnNumber === Number(turnMatch[1])) || null;
            return turns.find(turn => matchesSelector(turn, selector)) || null;
        },
        querySelectorAll(selector) {
            if (selector === '[data-testid^="conversation-turn-"]') return turns;
            if (selector === '[id^="cn-"]') return [];
            return [];
        }
    };

    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
        observe() {}
        disconnect() { this.disconnected = true; }
    }

    class FakePipeline {
        constructor() { this.platformId = 'CHATGPT'; }
        findElement(metadata) {
            const turn = turns.find(candidate => candidate.messageId === metadata.messageId);
            if (!turn) return null;
            return metadata.type === 'answer' ? (turn.headings[metadata.headingIndex] || null) : turn;
        }
        async extractWithIndex(options) {
            repairCalls.push(options);
            return repairResult;
        }
    }

    const conversationIndex = { disconnectCalls: 0, disconnect() { this.disconnectCalls++; } };
    const window = {
        location: { href: 'https://chatgpt.com/c/jump-test' },
        CSS: { escape: value => String(value) },
        innerWidth: 1200,
        innerHeight: 720,
        getComputedStyle(element) { return { overflowY: element === scroller ? 'auto' : 'visible' }; },
        addEventListener() {},
        removeEventListener() {},
        __AI_CHAT_EXPORT_TESTS__: { jumpTimeoutMs: 20, enableRepairScroll },
        AI_CHAT_CONVERSATION_INDEX: conversationIndex
    };

    const chrome = {
        runtime: {
            onMessage: {
                addListener(listener) { messageListener = listener; },
                removeListener() {}
            },
            onConnect: { addListener() {}, removeListener() {} },
            sendMessage(message) { sentMessages.push(message); }
        }
    };

    const context = {
        window,
        document,
        chrome,
        Pipeline: FakePipeline,
        MutationObserver: FakeMutationObserver,
        IntersectionObserver: class { observe() {} disconnect() {} },
        CSS: window.CSS,
        Element: FakeElement,
        CustomEvent: class {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        queueMicrotask
    };
    vm.runInNewContext(contentSource, context);
    const firstExtractRuntime = window.extractAndSendOutline;
    vm.runInNewContext(contentSource, context);
    assert.equal(window.extractAndSendOutline, firstExtractRuntime, 'same-version reinjection must preserve the active content runtime');
    assert.equal(conversationIndex.disconnectCalls, 0, 'same-version reinjection must not release the conversation index');
    context.extractAndSendOutline = window.extractAndSendOutline;

    messageListener({
        type: 'getOutline',
        requestToken: outlineToken,
        url: window.location.href
    }, {}, () => {});

    const jump = (metadata, overrides = {}) => new Promise(resolve => {
        const keptOpen = messageListener({
            type: 'scrollTo',
            elementId: `outline-${metadata.turnNumber}`,
            metadata,
            url: window.location.href,
            requestToken: outlineToken,
            ...overrides
        }, {}, resolve);
        assert.equal(keptOpen, true, 'async jump response channel must remain open');
    });

    const repair = (metadata, operationId = 'repair-operation', overrides = {}) => new Promise(resolve => {
        const keptOpen = messageListener({
            type: 'repairAndLocate',
            operationId,
            metadata,
            url: window.location.href,
            requestToken: outlineToken,
            ...overrides
        }, {}, resolve);
        assert.equal(keptOpen, true, 'async repair response channel must remain open');
    });

    const cancelRepair = operationId => new Promise(resolve => {
        const keptOpen = messageListener({ type: 'cancelRepair', operationId }, {}, resolve);
        assert.equal(keptOpen, true, 'cancel response channel must remain open');
    });

    return {
        FakeElement,
        turns,
        observers,
        scroller,
        sentMessages,
        window,
        conversationIndex,
        jump,
        repair,
        cancelRepair,
        repairCalls,
        setRepairResult(value) { repairResult = value; },
        triggerMutations() {
            observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback([]));
        }
    };
}

// Already-mounted exact targets do not move a neighboring turn.
{
    const harness = createHarness();
    const target = new harness.FakeElement(1, 'message-1');
    harness.turns.push(target);
    const result = await harness.jump({ type: 'question', turnNumber: 1, messageId: 'message-1' });
    assert.equal(result.success, true);
    assert.equal(target.anchorScrolls, 0);
    assert.equal(harness.scroller.scrollCalls.length, 1, 'exact target receives only the final centered scroll');
    assert.deepEqual(
        harness.sentMessages.filter(message => message.type === 'updateReadingPosition').map(message => message.elementId),
        ['outline-1'],
        'a successful click must immediately synchronize the exact side-panel reading marker'
    );
}

// Real-host hypothesis: one mounted neighboring turn causes the missing exact turn to mount.
{
    const harness = createHarness();
    const anchor = new harness.FakeElement(2, 'message-2');
    anchor.onAnchorScroll = () => {
        harness.turns.push(new harness.FakeElement(1, 'message-1'));
        harness.triggerMutations();
    };
    harness.turns.push(anchor);
    const result = await harness.jump({ type: 'question', turnNumber: 1, messageId: 'message-1', offset: 5_000 });
    assert.equal(result.success, true);
    assert.equal(anchor.anchorScrolls, 1, 'a click may move exactly one neighboring anchor');
    assert.equal(anchor.lastAnchorOptions.block, 'start');
    assert.equal(harness.scroller.scrollCalls.length, 1, 'ChatGPT ignores non-authoritative offsets and only performs final positioning');
}

// Failure is bounded: no exact identity means no repeated scroll and no false success.
{
    const harness = createHarness();
    const wrongIdentity = new harness.FakeElement(1, 'wrong-message');
    const anchor = new harness.FakeElement(2, 'message-2');
    harness.turns.push(wrongIdentity, anchor);
    const result = await harness.jump({ type: 'question', turnNumber: 1, messageId: 'message-1' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'target-not-mounted');
    assert.equal(anchor.anchorScrolls, 1);
    assert.equal(wrongIdentity.anchorScrolls, 0, 'same turn number with the wrong message identity is rejected');
}

// Route changes invalidate an in-flight navigation result.
{
    const harness = createHarness();
    const anchor = new harness.FakeElement(2, 'message-2');
    anchor.onAnchorScroll = () => { harness.window.location.href = 'https://chatgpt.com/c/other'; };
    harness.turns.push(anchor);
    const result = await harness.jump({ type: 'question', turnNumber: 1, messageId: 'message-1' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'route-changed');
    assert.equal(anchor.anchorScrolls, 1);
    assert.equal(harness.observers.every(observer => observer.disconnected), true, 'route changes clean the temporary observer');
}

// Answer items wait for the exact heading instead of accepting the assistant container.
{
    const harness = createHarness();
    const assistant = new harness.FakeElement(2, 'assistant-2');
    let firstHeading;
    let selectedHeading;
    assistant.onAnchorScroll = () => {
        firstHeading = new harness.FakeElement(2, 'heading-1', { tagName: 'H2' });
        selectedHeading = new harness.FakeElement(2, 'heading-2', { tagName: 'H3' });
        firstHeading.parentElement = assistant;
        selectedHeading.parentElement = assistant;
        assistant.headings = [firstHeading, selectedHeading];
        harness.triggerMutations();
    };
    harness.turns.push(new harness.FakeElement(1, 'user-1'), assistant);
    const result = await harness.jump({ type: 'answer', turnNumber: 2, messageId: 'assistant-2', headingIndex: 1 });
    assert.equal(result.success, true);
    assert.equal(assistant.anchorScrolls, 1);
    assert.equal(harness.scroller.scrollCalls.length, 1, 'the mounted heading, not the answer container, receives final positioning');
    assert.equal(selectedHeading.rectReads > 0, true, 'the requested headingIndex is centered');
    assert.equal(firstHeading.rectReads, 0, 'a sibling heading is not mistaken for the requested target');
}

// ChatGPT navigation requires the same URL/token identity used to build the outline.
{
    const harness = createHarness();
    harness.turns.push(new harness.FakeElement(1, 'message-1'));
    const missingToken = await harness.jump(
        { type: 'question', turnNumber: 1, messageId: 'message-1' },
        { requestToken: '' }
    );
    assert.equal(missingToken.success, false);
    assert.equal(missingToken.reason, 'missing-request-identity');

    const missingUrl = await harness.jump(
        { type: 'question', turnNumber: 1, messageId: 'message-1' },
        { url: '' }
    );
    assert.equal(missingUrl.success, false);
    assert.equal(missingUrl.reason, 'missing-request-identity');

    const wrongToken = await harness.jump(
        { type: 'question', turnNumber: 1, messageId: 'message-1' },
        { requestToken: 'old-token' }
    );
    assert.equal(wrongToken.success, false);
    assert.equal(wrongToken.reason, 'request-mismatch');

    const wrongUrl = await harness.jump(
        { type: 'question', turnNumber: 1, messageId: 'message-1' },
        { url: 'https://chatgpt.com/c/old-route' }
    );
    assert.equal(wrongUrl.success, false);
    assert.equal(wrongUrl.reason, 'route-mismatch');

    const missingTargetIdentity = await harness.jump({ type: 'answer', turnNumber: 1 });
    assert.equal(missingTargetIdentity.success, false);
    assert.equal(missingTargetIdentity.reason, 'missing-target-identity');
}

// A newer click invalidates the previous bounded wait and its observer.
{
    const harness = createHarness();
    const anchor = new harness.FakeElement(2, 'message-2');
    harness.turns.push(anchor);
    const firstJump = harness.jump({ type: 'question', turnNumber: 1, messageId: 'message-1' });
    await Promise.resolve();
    await Promise.resolve();
    const secondResult = await harness.jump({ type: 'question', turnNumber: 2, messageId: 'message-2' });
    const firstResult = await firstJump;
    assert.equal(secondResult.success, true);
    assert.equal(firstResult.success, false);
    assert.equal(anchor.anchorScrolls, 1, 'the first click never repeats its anchor movement');
    assert.equal(harness.observers.every(observer => observer.disconnected), true, 'superseded waits release their observers');
}

// Repair first rebuilds the outline using a forced ChatGPT index refresh, then
// continues only when the old stable identity resolves to exactly one new item.
{
    const harness = createHarness();
    harness.turns.push(new harness.FakeElement(1, 'message-1'));
    const metadata = { type: 'question', turnNumber: 99, messageId: 'message-1' };
    harness.setRepairResult({
        outline: [{ id: 'repaired-question', type: 'question', text: 'Question', metadata: { ...metadata, turnNumber: 1 } }],
        diagnostics: { url: harness.window.location.href, stats: {} }
    });
    const result = await harness.repair(metadata);
    assert.equal(result.success, true);
    assert.equal(result.outlineReplaced, true);
    assert.equal(harness.repairCalls[0].force, true, 'repair forces a fresh index pass');
    assert.equal(harness.repairCalls[0].awaitApi, true, 'repair waits briefly for canonical data before falling back');
    assert.equal(harness.sentMessages.some(message => message.type === 'outline' && message.outline?.[0]?.id === 'repaired-question'), true);
}

// The production default rechecks a missing target but never moves the page
// until the bounded scroll phase has passed live acceptance and is enabled.
{
    const harness = createHarness();
    const anchor = new harness.FakeElement(2, 'message-2');
    harness.turns.push(anchor);
    const metadata = { type: 'question', turnNumber: 1, messageId: 'message-1' };
    harness.setRepairResult({
        outline: [{ id: 'missing-question', type: 'question', text: 'Question', metadata }],
        diagnostics: { url: harness.window.location.href, stats: {} }
    });
    const result = await harness.repair(metadata, 'gated-repair');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'target-not-mounted');
    assert.equal(result.scrollAssistAvailable, false);
    assert.equal(anchor.anchorScrolls, 0, 'the gated phase must not move a mounted neighbor');
}

// Once explicitly enabled after live acceptance, bounded repair uses an exact
// identity check and one directional virtual-window move before final centering.
{
    const harness = createHarness([], { enableRepairScroll: true });
    const anchor = new harness.FakeElement(2, 'message-2');
    anchor.onAnchorScroll = () => {
        harness.turns.push(new harness.FakeElement(1, 'message-1'));
        harness.triggerMutations();
    };
    harness.turns.push(anchor);
    const metadata = { type: 'question', turnNumber: 1, messageId: 'message-1' };
    harness.setRepairResult({
        outline: [{ id: 'mounted-after-repair', type: 'question', text: 'Question', metadata }],
        diagnostics: { url: harness.window.location.href, stats: {} }
    });
    const result = await harness.repair(metadata, 'enabled-repair');
    assert.equal(result.success, true);
    assert.equal(result.steps, 1);
    assert.equal(anchor.anchorScrolls, 1);
}

// Ambiguous rebuilt identities are a directory repair outcome, never permission
// to scroll toward a potentially wrong item.
{
    const harness = createHarness();
    const metadata = { type: 'question', turnNumber: 1, messageId: 'message-1' };
    harness.setRepairResult({
        outline: [
            { id: 'one', type: 'question', text: 'Question A', metadata },
            { id: 'two', type: 'question', text: 'Question B', metadata }
        ],
        diagnostics: { url: harness.window.location.href, stats: {} }
    });
    const result = await harness.repair(metadata, 'ambiguous-repair');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'identity-conflict');
    assert.equal(harness.scroller.scrollCalls.length, 1, 'ambiguous repair only restores the captured reading position');
    assert.equal(harness.scroller.scrollCalls[0].top, 9_000);
}

// Cancellation invalidates the active repair before the forced reindex returns
// and restores the captured reading position rather than continuing to scroll.
{
    const harness = createHarness();
    let resolveReindex;
    harness.setRepairResult(new Promise(resolve => { resolveReindex = resolve; }));
    const metadata = { type: 'question', turnNumber: 1, messageId: 'message-1' };
    const pendingRepair = harness.repair(metadata, 'cancelled-repair');
    await Promise.resolve();
    const cancelled = await harness.cancelRepair('cancelled-repair');
    assert.equal(cancelled.success, true);
    resolveReindex({ outline: [], diagnostics: { url: harness.window.location.href, stats: {} } });
    const result = await pendingRepair;
    assert.equal(result.success, false);
    assert.equal(result.reason, 'cancelled');
    assert.equal(result.restored, true);
    assert.equal(harness.scroller.scrollCalls.at(-1).top, 9_000);
}

console.log('chatgpt bounded jump ok');
