(function () {
    'use strict';

    const BRIDGE_VERSION = '2026-07-14-route-epoch-bridge';
    const REQUEST_SOURCE = 'ai-chat-exporter-index';
    const RESPONSE_SOURCE = 'ai-chat-export-pro';
    const FAILURE_COOLDOWN_MS = 5000;
    const MAX_CACHED_CONVERSATIONS = 2;
    const API_REQUEST_TIMEOUT_MS = 8000;
    const CHATGPT_CACHE_TTL_MS = 15000;

    const existing = window.__AI_CHAT_EXPORTER_CHATGPT_BRIDGE__;
    if (existing?.version === BRIDGE_VERSION) return;
    existing?.cleanup?.();

    const payloads = existing?.payloads instanceof Map ? existing.payloads : new Map();
    const payloadTimes = new Map();
    const payloadEpochs = new Map();
    const inFlight = new Map();
    const failures = new Map();
    const nativeLoads = new Map();
    const directRequests = new Set();
    const activeControllers = new Map();
    let routeEpoch = 0;
    let routeHref = location.href;
    const originalFetch = typeof window.fetch === 'function'
        ? window.fetch.bind(window)
        : fetch;

    function syncRouteEpoch() {
        if (location.href !== routeHref) {
            routeHref = location.href;
            routeEpoch++;
        }
        return routeEpoch;
    }

    const patchHistoryMethod = method => {
        const original = window.history?.[method];
        if (typeof original !== 'function') return () => {};
        const patched = function (...args) {
            const result = original.apply(this, args);
            syncRouteEpoch();
            return result;
        };
        window.history[method] = patched;
        return () => {
            if (window.history[method] === patched) window.history[method] = original;
        };
    };
    const restorePushState = patchHistoryMethod('pushState');
    const restoreReplaceState = patchHistoryMethod('replaceState');
    const handlePopState = () => syncRouteEpoch();
    window.addEventListener('popstate', handlePopState);

    function conversationIdFromRequest(input) {
        try {
            const rawUrl = typeof input === 'string' ? input : input?.url;
            const url = new URL(rawUrl, location.origin);
            const match = url.pathname.match(/^\/backend-api\/conversation\/([^/?#]+)/);
            return match ? decodeURIComponent(match[1]) : '';
        } catch (_) {
            return '';
        }
    }

    function compactConversationPayload(payload) {
        const mapping = payload?.mapping || {};
        const compactMapping = {};
        let node = mapping[payload?.current_node];
        const seen = new Set();
        while (node && !seen.has(node.id)) {
            seen.add(node.id);
            const message = node.message;
            const role = message?.author?.role;
            const compactNode = {
                id: node.id,
                parent: node.parent
            };
            if (role === 'user' || role === 'assistant') {
                compactNode.message = {
                    id: message.id || node.id,
                    author: { role },
                    content: message.content
                };
            }
            // 保留当前分支的非消息节点，保证 current_node 可从末端一直回溯到 root。
            compactMapping[node.id] = compactNode;
            node = mapping[node.parent];
        }
        return {
            title: payload?.title || '',
            current_node: payload?.current_node || '',
            mapping: compactMapping
        };
    }

    function cachePayload(conversationId, payload, captureEpoch = syncRouteEpoch()) {
        payloads.delete(conversationId);
        payloads.set(conversationId, payload);
        payloadTimes.delete(conversationId);
        payloadTimes.set(conversationId, Date.now());
        payloadEpochs.delete(conversationId);
        payloadEpochs.set(conversationId, captureEpoch);
        while (payloads.size > MAX_CACHED_CONVERSATIONS) {
            const oldest = payloads.keys().next().value;
            payloads.delete(oldest);
            payloadTimes.delete(oldest);
            payloadEpochs.delete(oldest);
        }
    }

    function captureNativePayload(conversationId, payload, { notify = false, captureEpoch = syncRouteEpoch(), routeUrl = location.href } = {}) {
        const compactPayload = compactConversationPayload(payload);
        cachePayload(conversationId, compactPayload, captureEpoch);
        failures.delete(conversationId);
        if (notify) {
            // The page has already loaded a fresher conversation. Push it to the isolated
            // index even when no explicit side-panel request is currently pending.
            window.postMessage({
                source: RESPONSE_SOURCE,
                type: 'chatgpt-conversation',
                conversationId,
                routeEpoch: captureEpoch,
                routeUrl,
                payload: compactPayload
            }, location.origin);
        }
        return compactPayload;
    }

    // ChatGPT already requests its active conversation while loading the page.
    // Capture that response instead of issuing a second identical full-history fetch.
    window.fetch = function interceptedFetch(input, init) {
        const conversationId = conversationIdFromRequest(input);
        const captureEpoch = syncRouteEpoch();
        const routeUrl = location.href;
        const request = originalFetch(input, init);
        if (!conversationId || directRequests.has(conversationId)) return request;

        const capture = Promise.resolve(request)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.clone().json();
            })
            .then(payload => {
                if (syncRouteEpoch() !== captureEpoch || location.href !== routeUrl) return null;
                return captureNativePayload(conversationId, payload, { notify: true, captureEpoch, routeUrl });
            })
            .catch(error => {
                console.debug('AI Chat Exporter: native ChatGPT response was not cached', error);
                return null;
            })
            .finally(() => {
                if (nativeLoads.get(conversationId)?.promise === capture) nativeLoads.delete(conversationId);
            });
        nativeLoads.set(conversationId, { promise: capture, routeEpoch: captureEpoch, routeUrl });
        return request;
    };

    async function loadConversation(conversationId, force = false, requestToken = '') {
        const requestEpoch = syncRouteEpoch();
        const requestRouteUrl = location.href;
        if (!force && payloads.has(conversationId) && payloadEpochs.get(conversationId) === requestEpoch) {
            const payload = payloads.get(conversationId);
            const cachedAt = payloadTimes.get(conversationId) || 0;
            payloads.delete(conversationId);
            payloads.set(conversationId, payload);
            if (Date.now() - cachedAt < CHATGPT_CACHE_TTL_MS) return payload;
        }
        const inFlightKey = requestToken ? `${conversationId}:${requestToken}` : conversationId;
        if (inFlight.has(inFlightKey)) return inFlight.get(inFlightKey);
        const nativeLoad = nativeLoads.get(conversationId);
        if (!force && nativeLoad && nativeLoad.routeEpoch === requestEpoch && nativeLoad.routeUrl === requestRouteUrl) {
            return nativeLoad.promise.then(payload => {
                if (payload) return payload;
                // The page request failed or was not JSON; use the explicit request as a fallback.
                return loadConversation(conversationId, true);
            });
        }

        const failedAt = failures.get(conversationId) || 0;
        if (!force && Date.now() - failedAt < FAILURE_COOLDOWN_MS) {
            throw new Error('ChatGPT conversation request is cooling down');
        }

        // Keep the request shape aligned with the public ChatGPT exporter pattern:
        // a normal single-conversation endpoint, not a speculative 100,000-item page.
        // The browser's logged-in page session supplies authentication automatically.
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const abortTimer = controller
            ? setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS)
            : null;
        directRequests.add(conversationId);
        if (controller) activeControllers.set(inFlightKey, controller);
        const request = window.fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
            credentials: 'include',
            cache: 'no-store',
            headers: { accept: 'application/json' },
            signal: controller?.signal
        }).then(async response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (syncRouteEpoch() !== requestEpoch || location.href !== requestRouteUrl) {
                return compactConversationPayload(payload);
            }
            return captureNativePayload(conversationId, payload, {
                captureEpoch: requestEpoch,
                routeUrl: requestRouteUrl
            });
        }).catch(error => {
            const routeChanged = syncRouteEpoch() !== requestEpoch || location.href !== requestRouteUrl;
            if (error?.name !== 'AbortError' && !routeChanged) failures.set(conversationId, Date.now());
            throw error;
        }).catch(error => {
            if (error?.name === 'AbortError') throw new Error(`ChatGPT conversation request timed out after ${API_REQUEST_TIMEOUT_MS}ms`);
            throw error;
        }).finally(() => {
            if (abortTimer) clearTimeout(abortTimer);
            directRequests.delete(conversationId);
            activeControllers.delete(inFlightKey);
            inFlight.delete(inFlightKey);
        });

        inFlight.set(inFlightKey, request);
        return request;
    }

    async function handleRequest(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = event.data;
        if (message?.source !== REQUEST_SOURCE) return;
        if (message.type === 'chatgpt-conversation-release') {
            routeEpoch++;
            routeHref = location.href;
            activeControllers.forEach(controller => controller.abort());
            activeControllers.clear();
            inFlight.clear();
            nativeLoads.clear();
            directRequests.clear();
            payloads.clear();
            payloadTimes.clear();
            payloadEpochs.clear();
            failures.clear();
            return;
        }
        if (message.type !== 'chatgpt-conversation-request') return;
        const conversationId = String(message.conversationId || '');
        if (!conversationId) return;
        const requestEpoch = syncRouteEpoch();
        const requestRouteUrl = location.href;

        try {
            const payload = await loadConversation(conversationId, message.force === true, message.requestId);
            window.postMessage({
                source: RESPONSE_SOURCE,
                type: 'chatgpt-conversation',
                requestId: message.requestId,
                conversationId,
                routeEpoch: requestEpoch,
                routeUrl: requestRouteUrl,
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
        payloadTimes,
        payloadEpochs,
        loadConversation,
        compactConversationPayload,
        originalFetch,
        cleanup() {
            window.fetch = originalFetch;
            window.removeEventListener('message', handleRequest);
            window.removeEventListener('popstate', handlePopState);
            restorePushState();
            restoreReplaceState();
            activeControllers.forEach(controller => controller.abort());
            activeControllers.clear();
            inFlight.clear();
            nativeLoads.clear();
            directRequests.clear();
            payloads.clear();
            payloadTimes.clear();
            payloadEpochs.clear();
            failures.clear();
        }
    };
})();
