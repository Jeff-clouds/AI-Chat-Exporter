(function () {
    'use strict';

    const BRIDGE_VERSION = '2026-07-14-bounded-cache';
    const REQUEST_SOURCE = 'ai-chat-exporter-index';
    const RESPONSE_SOURCE = 'ai-chat-export-pro';
    const FAILURE_COOLDOWN_MS = 5000;
    const MAX_CACHED_CONVERSATIONS = 2;

    const existing = window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__;
    if (existing?.version === BRIDGE_VERSION) return;
    existing?.cleanup?.();

    const payloads = existing?.payloads instanceof Map ? existing.payloads : new Map();
    const inFlight = new Map();
    const failures = new Map();

    function cachePayload(conversationId, payload) {
        payloads.delete(conversationId);
        payloads.set(conversationId, payload);
        while (payloads.size > MAX_CACHED_CONVERSATIONS) {
            payloads.delete(payloads.keys().next().value);
        }
    }

    async function loadConversation(conversationId, force = false) {
        if (!force && payloads.has(conversationId)) {
            const payload = payloads.get(conversationId);
            cachePayload(conversationId, payload);
            return payload;
        }
        if (inFlight.has(conversationId)) return inFlight.get(conversationId);

        const failedAt = failures.get(conversationId) || 0;
        if (!force && Date.now() - failedAt < FAILURE_COOLDOWN_MS) {
            throw new Error('ChatGPT conversation request is cooling down');
        }

        const request = fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}?offset=0&limit=100000`, {
            credentials: 'include'
        }).then(async response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            cachePayload(conversationId, payload);
            failures.delete(conversationId);
            return payload;
        }).catch(error => {
            failures.set(conversationId, Date.now());
            throw error;
        }).finally(() => {
            inFlight.delete(conversationId);
        });

        inFlight.set(conversationId, request);
        return request;
    }

    async function handleRequest(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = event.data;
        if (message?.source !== REQUEST_SOURCE) return;
        if (message.type === 'chatgpt-conversation-release') {
            payloads.clear();
            failures.clear();
            return;
        }
        if (message.type !== 'chatgpt-conversation-request') return;
        const conversationId = String(message.conversationId || '');
        if (!conversationId) return;

        try {
            const payload = await loadConversation(conversationId, message.force === true);
            window.postMessage({
                source: RESPONSE_SOURCE,
                type: 'chatgpt-conversation',
                requestId: message.requestId,
                conversationId,
                payload
            }, location.origin);
        } catch (error) {
            window.postMessage({
                source: RESPONSE_SOURCE,
                type: 'chatgpt-conversation-error',
                requestId: message.requestId,
                conversationId,
                error: error.message
            }, location.origin);
        }
    }

    window.addEventListener('message', handleRequest);
    window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__ = {
        version: BRIDGE_VERSION,
        payloads,
        loadConversation,
        cleanup() {
            window.removeEventListener('message', handleRequest);
            inFlight.clear();
            payloads.clear();
            failures.clear();
        }
    };
})();
