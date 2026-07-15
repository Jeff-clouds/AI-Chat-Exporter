(function () {
    'use strict';

    const CHATGPT_API = /chatgpt\.com/;
    const DOUBAO = /doubao\.com/;
    const INDEX_VERSION = '2026-07-15-chatgpt-section-turns';
    const CHATGPT_REQUEST_TIMEOUT_MS = 20000;
    const CHATGPT_CACHE_TTL_MS = 15000;
    const MAX_CACHED_CONVERSATIONS = 2;
    const MAX_MOUNTED_CHATGPT_TURNS = 48;
    const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const stripChatGptRolePrefix = (value, role) => {
        const text = cleanText(value);
        if (role === 'user') return text.replace(/^(?:你说|You said)\s*[:：]\s*/i, '');
        if (role === 'assistant') return text.replace(/^ChatGPT\s*(?:说|said)\s*[:：]\s*/i, '');
        return text;
    };

    function stableTextFingerprint(value) {
        const text = cleanText(value);
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `${(hash >>> 0).toString(36)}:${text.length}`;
    }

    function chatGptTurnContainer(element) {
        return element?.closest?.('[data-testid^="conversation-turn-"]') || element || null;
    }

    function chatGptElementIds(element) {
        if (!element?.getAttribute) return [];
        const container = chatGptTurnContainer(element);
        return Array.from(new Set([
            element.getAttribute('data-message-id'),
            element.getAttribute('data-turn-id'),
            container?.getAttribute?.('data-message-id'),
            container?.getAttribute?.('data-turn-id')
        ].filter(Boolean)));
    }

    function chatGptTurnIdentity(element) {
        if (!element?.getAttribute) return '';
        const turnId = chatGptElementIds(element)[0];
        if (turnId) return `id:${turnId}`;
        const role = element.getAttribute('data-turn') || element.getAttribute('data-message-author-role') || '';
        const text = cleanText(element.textContent);
        return role && text ? `content:${role}:${stableTextFingerprint(text)}` : '';
    }

    function currentConversationId() {
        const match = location.pathname.match(/\/c\/([^/?#]+)|\/chat\/([^/?#]+)/);
        return match ? (match[1] || match[2]) : '';
    }

    function contentToMarkdown(content) {
        const parts = content?.parts;
        if (!Array.isArray(parts)) return String(content?.text || '').replace(/\r\n?/g, '\n').trim();
        return parts.map(part => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            return '';
        }).join('\n').replace(/\r\n?/g, '\n').trim();
    }

    function contentToText(content) {
        return cleanText(contentToMarkdown(content));
    }

    function currentBranchNodes(payload) {
        const mapping = payload?.mapping || {};
        let node = mapping[payload?.current_node];
        const nodes = [];
        const seen = new Set();
        while (node && !seen.has(node.id)) {
            seen.add(node.id);
            nodes.push(node);
            node = mapping[node.parent];
        }
        return nodes.reverse();
    }

    function markdownFromHtml(html, fallback) {
        if (!html) return fallback || '';
        try {
            if (typeof window.TurndownService === 'function') {
                return new window.TurndownService({ codeBlockStyle: 'fenced' }).turndown(html).trim();
            }
        } catch (error) {
            console.warn('AI Chat Export Pro: Doubao HTML conversion failed', error);
        }
        return fallback || '';
    }

    function doubaoElementFingerprint(element, role) {
        return `${role}|${cleanText(element?.textContent)}|${element?.innerHTML?.length || 0}`;
    }

    class ConversationIndex {
        constructor() {
            this.version = INDEX_VERSION;
            this.url = '';
            this.platform = '';
            this.records = new Map();
            this.order = [];
            this.chatGptDomHeadings = new Map();
            this.nextSequence = 0;
            this.title = '';
            this.observer = null;
            this.scrollTarget = null;
            this.scrollListener = null;
            this.scrollCapture = false;
            this.chatGptScanTimer = null;
            this.chatGptTrailingTimer = null;
            this.chatGptObserverRetryTimer = null;
            this.chatGptEmptyFallbackTimer = null;
            this.chatGptEmptyBaselineIdentities = null;
            this.chatGptEmptyRetryCount = 0;
            this.chatGptDomRouteTrusted = false;
            this.lastChatGptScanAt = 0;
            this.doubaoScanTimer = null;
            this.doubaoTrailingTimer = null;
            this.lastDoubaoScanAt = 0;
            this.doubaoFingerprints = new Map();
            this.chatGptPayloadCache = new Map();
            this.chatGptPayloadTimes = new Map();
            this.lastChatGptTurnIdentities = new Set();
            this.excludedChatGptTurnIdentities = new Set();
            this.chatGptCanonicalTurnIds = new Set();
            this.chatGptRouteAwaitingApiConfirmation = false;
            this.routeGeneration = 0;
            this.chatGptLoads = new Map();
            this.pendingChatGptRequests = new Map();
            this.connected = false;
            this.handleWindowMessage = event => {
                if (event.source !== window || event.origin !== location.origin) return;
                const message = event.data;
                if (message?.source !== 'ai-chat-export-pro') return;
                if (message.type === 'chatgpt-conversation' && message.payload) {
                    const conversationId = message.conversationId || currentConversationId();
                    if (message.requestId) {
                        const pending = this.pendingChatGptRequests.get(message.requestId);
                        if (!pending || pending.conversationId !== conversationId) return;
                        if (pending.routeGeneration !== this.routeGeneration || pending.url !== location.href) {
                            this.finishChatGptRequest(message.requestId, new Error('Stale conversation response'));
                            return;
                        }
                        this.finishChatGptRequest(message.requestId, null, message.payload);
                        return;
                    }
                    if (message.routeUrl && message.routeUrl !== location.href) return;
                    this.cacheChatGptPayload(conversationId, message.payload);
                    const isCurrentConversation = conversationId === currentConversationId();
                    const imported = isCurrentConversation && this.importChatGptPayload(message.payload);
                    if (imported && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
                    }
                } else if (message.type === 'chatgpt-conversation-error') {
                    const pending = this.pendingChatGptRequests.get(message.requestId);
                    if (!pending || pending.conversationId !== message.conversationId) return;
                    if (pending.routeGeneration !== this.routeGeneration || pending.url !== location.href) {
                        this.finishChatGptRequest(message.requestId, new Error('Stale conversation response'));
                        return;
                    }
                    this.finishChatGptRequest(message.requestId, new Error(message.error || 'ChatGPT API unavailable'));
                }
            };
            this.connect();
        }

        cacheChatGptPayload(conversationId, payload) {
            if (!conversationId) return;
            this.chatGptPayloadCache.delete(conversationId);
            this.chatGptPayloadCache.set(conversationId, payload);
            this.chatGptPayloadTimes.delete(conversationId);
            this.chatGptPayloadTimes.set(conversationId, Date.now());
            while (this.chatGptPayloadCache.size > MAX_CACHED_CONVERSATIONS) {
                const oldest = this.chatGptPayloadCache.keys().next().value;
                this.chatGptPayloadCache.delete(oldest);
                this.chatGptPayloadTimes.delete(oldest);
            }
        }

        connect() {
            if (this.connected) return;
            window.addEventListener('message', this.handleWindowMessage);
            this.connected = true;
        }

        finishChatGptRequest(requestId, error, payload) {
            const pending = this.pendingChatGptRequests.get(requestId);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pendingChatGptRequests.delete(requestId);
            if (error) pending.reject(error);
            else pending.resolve(payload);
        }

        resetForLocation() {
            const nextUrl = location.href;
            if (nextUrl === this.url) return;
            const previousUrl = this.url;
            const previousPlatform = this.platform;
            const nextPlatform = CHATGPT_API.test(nextUrl) ? 'CHATGPT' : (DOUBAO.test(nextUrl) ? 'DOUBAO' : '');
            this.disconnectObservers();
            this.routeGeneration++;
            this.pendingChatGptRequests.forEach((pending, requestId) => {
                if (pending.routeGeneration === this.routeGeneration) return;
                clearTimeout(pending.timer);
                this.pendingChatGptRequests.delete(requestId);
                pending.reject(new Error('Conversation route changed'));
            });
            this.url = nextUrl;
            this.platform = nextPlatform;
            // ChatGPT updates the URL before replacing the old conversation DOM. Preserve
            // the previous mounted identities and reject them under the new route.
            if (previousUrl && previousUrl !== nextUrl && previousPlatform === 'CHATGPT' && nextPlatform === 'CHATGPT') {
                const previousIdentities = this.lastChatGptTurnIdentities.size > 0
                    ? this.lastChatGptTurnIdentities
                    : new Set(this.getMessages().map(message => message.turnId || message.id).filter(Boolean).map(id => `id:${id}`));
                this.excludedChatGptTurnIdentities = new Set(previousIdentities);
                this.chatGptRouteAwaitingApiConfirmation = true;
            } else if (nextPlatform !== 'CHATGPT') {
                this.excludedChatGptTurnIdentities.clear();
                this.lastChatGptTurnIdentities.clear();
                this.chatGptRouteAwaitingApiConfirmation = false;
            }
            this.chatGptCanonicalTurnIds.clear();
            this.chatGptEmptyBaselineIdentities = null;
            this.chatGptEmptyRetryCount = 0;
            this.chatGptDomRouteTrusted = false;
            this.records.clear();
            this.order = [];
            this.chatGptDomHeadings.clear();
            this.doubaoFingerprints.clear();
            this.nextSequence = 0;
            this.lastChatGptScanAt = 0;
            this.title = document.title || '';
        }

        disconnectObservers() {
            if (this.observer) this.observer.disconnect();
            this.observer = null;
            if (this.chatGptScanTimer) clearTimeout(this.chatGptScanTimer);
            this.chatGptScanTimer = null;
            if (this.chatGptTrailingTimer) clearTimeout(this.chatGptTrailingTimer);
            this.chatGptTrailingTimer = null;
            if (this.chatGptObserverRetryTimer) clearTimeout(this.chatGptObserverRetryTimer);
            this.chatGptObserverRetryTimer = null;
            if (this.chatGptEmptyFallbackTimer) clearTimeout(this.chatGptEmptyFallbackTimer);
            this.chatGptEmptyFallbackTimer = null;
            if (this.doubaoScanTimer) clearTimeout(this.doubaoScanTimer);
            this.doubaoScanTimer = null;
            if (this.doubaoTrailingTimer) clearTimeout(this.doubaoTrailingTimer);
            this.doubaoTrailingTimer = null;
            if (this.scrollTarget && this.scrollListener) {
                this.scrollTarget.removeEventListener('scroll', this.scrollListener, this.scrollCapture);
            }
            this.scrollTarget = null;
            this.scrollListener = null;
            this.scrollCapture = false;
        }

        disconnect() {
            this.disconnectObservers();
            this.routeGeneration++;
            const retainedIdentities = new Set(this.lastChatGptTurnIdentities);
            this.getMessages().forEach(message => {
                const id = message.turnId || message.id;
                if (id) retainedIdentities.add(`id:${id}`);
            });
            this.lastChatGptTurnIdentities = retainedIdentities;
            window.postMessage({
                source: 'ai-chat-exporter-index',
                type: 'chatgpt-conversation-release'
            }, location.origin);
            if (this.connected) window.removeEventListener('message', this.handleWindowMessage);
            this.connected = false;
            this.pendingChatGptRequests.forEach(pending => {
                clearTimeout(pending.timer);
                pending.reject(new Error('Conversation index disconnected'));
            });
            this.pendingChatGptRequests.clear();
            this.chatGptLoads.clear();
            this.chatGptPayloadCache.clear();
            this.chatGptPayloadTimes.clear();
            this.chatGptCanonicalTurnIds.clear();
            this.records.clear();
            this.order = [];
            this.chatGptDomHeadings.clear();
            this.doubaoFingerprints.clear();
            this.nextSequence = 0;
            this.title = '';
        }

        upsert(record) {
            if (!record?.id || !record.text) return false;
            const existing = this.records.get(record.id);
            this.records.set(record.id, { ...existing, ...record, sequence: existing?.sequence ?? this.nextSequence++ });
            if (!existing) this.order.push(record.id);
            return !existing || existing.text !== record.text || existing.html !== record.html;
        }

        getMessages() {
            return this.order.map(id => this.records.get(id)).filter(Boolean).sort((left, right) => {
                if (Number.isFinite(left.turnNumber) && Number.isFinite(right.turnNumber)) {
                    return left.turnNumber - right.turnNumber;
                }
                if (Number.isFinite(left.offset) && Number.isFinite(right.offset) && left.offset !== right.offset) {
                    return left.offset - right.offset;
                }
                if (Number.isFinite(left.windowIndex) && Number.isFinite(right.windowIndex) && left.windowIndex !== right.windowIndex) {
                    return left.windowIndex - right.windowIndex;
                }
                return left.sequence - right.sequence;
            });
        }

        async refresh(options = {}) {
            this.connect();
            this.resetForLocation();
            const refreshUrl = location.href;
            if (this.platform === 'CHATGPT') {
                // Render mounted turns immediately, then upgrade from the API without blocking the panel.
                // The observer is scoped to the conversation root and each scan is bounded.
                this.scanChatGptDom({ cacheMessages: true });
                if (options.observe !== false) this.observeChatGpt();
                const apiLoad = this.loadChatGptApi(options);
                if (options.awaitApi === false) {
                    // The side panel must not wait for a slow internal endpoint. When API
                    // data arrives later, notify the existing panel to replace DOM records.
                    apiLoad.then(apiLoaded => {
                        if (!apiLoaded || location.href !== refreshUrl || typeof window.dispatchEvent !== 'function') return;
                        window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
                    });
                } else {
                    await apiLoad;
                }
                // SPA 切换可能发生在 API 等待期间；旧请求只缓存，不能生成新会话的目录。
                if (location.href !== refreshUrl) return this.refresh(options);
                // API 成功后会用完整当前分支替换临时 DOM 消息；DOM 标题缓存继续保留。
            } else if (this.platform === 'DOUBAO') {
                this.scanDoubaoWindow();
                if (options.observe !== false) this.observeDoubao();
            }
            return this.snapshot();
        }

        async loadChatGptApi({ force = false } = {}) {
            const conversationId = currentConversationId();
            if (!conversationId) return false;
            const routeGeneration = this.routeGeneration;
            const requestUrl = location.href;
            if (!force && this.chatGptPayloadCache.has(conversationId)) {
                const payload = this.chatGptPayloadCache.get(conversationId);
                const cachedAt = this.chatGptPayloadTimes.get(conversationId) || 0;
                // Touch the LRU order without pretending stale data was freshly fetched.
                this.chatGptPayloadCache.delete(conversationId);
                this.chatGptPayloadCache.set(conversationId, payload);
                this.importChatGptPayload(payload);
                if (Date.now() - cachedAt < CHATGPT_CACHE_TTL_MS) return this.order.length > 0;
            }
            const loadKey = `${routeGeneration}:${conversationId}`;
            if (this.chatGptLoads.has(loadKey)) return this.chatGptLoads.get(loadKey);

            const requestId = `${conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
            const load = new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pendingChatGptRequests.delete(requestId);
                    reject(new Error('ChatGPT conversation request timed out'));
                }, CHATGPT_REQUEST_TIMEOUT_MS);
                this.pendingChatGptRequests.set(requestId, {
                    resolve,
                    reject,
                    timer,
                    conversationId,
                    routeGeneration,
                    url: requestUrl
                });
                window.postMessage({
                    source: 'ai-chat-exporter-index',
                    type: 'chatgpt-conversation-request',
                    requestId,
                    conversationId,
                    force
                }, location.origin);
            }).then(payload => {
                if (routeGeneration !== this.routeGeneration || requestUrl !== location.href) return false;
                this.cacheChatGptPayload(conversationId, payload);
                if (conversationId !== currentConversationId()) return false;
                this.importChatGptPayload(payload);
                return this.order.length > 0;
            }).catch(error => {
                const expectedCancellation = error?.message === 'Conversation route changed'
                    || error?.message === 'Stale conversation response'
                    || error?.message === 'Conversation index disconnected';
                if (!expectedCancellation) {
                    console.warn('AI Chat Export Pro: ChatGPT API unavailable; retaining bounded mounted DOM outline', error);
                }
                if (routeGeneration === this.routeGeneration && requestUrl === location.href && conversationId === currentConversationId()) {
                    this.chatGptRouteAwaitingApiConfirmation = false;
                    const changed = this.scanChatGptDom({ cacheMessages: true });
                    if (changed && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
                    }
                }
                return false;
            }).finally(() => this.chatGptLoads.delete(loadKey));
            this.chatGptLoads.set(loadKey, load);
            return load;
        }

        importChatGptPayload(payload) {
            if (!payload?.mapping) return false;
            let turnNumber = 0;
            const apiRecords = [];
            currentBranchNodes(payload).forEach(node => {
                const role = node?.message?.author?.role;
                if (role !== 'user' && role !== 'assistant') return;
                turnNumber++;
                const markdown = contentToMarkdown(node.message.content);
                const text = cleanText(markdown);
                if (!text) return;
                apiRecords.push({
                    id: node.message.id || node.id,
                    turnId: node.message.id || node.id,
                    // mapping 会包含无消息的 root 节点；只为真实 user/assistant 递增，才能和 conversation-turn-N 对齐。
                    turnNumber,
                    role,
                    text,
                    // ChatGPT 的 API 不提供标题 HTML；必须保留 Markdown 换行，供侧栏识别 H1-H6。
                    markdown,
                    offset: null
                });
            });
            if (apiRecords.length === 0) {
                // An empty response does not prove that the currently mounted DOM belongs
                // to the new URL. With no previous identities to exclude, record the
                // transition window and wait for its identities to change before trusting it.
                if (this.chatGptRouteAwaitingApiConfirmation && this.excludedChatGptTurnIdentities.size === 0) {
                    this.chatGptEmptyBaselineIdentities = new Set(
                        this.getMountedChatGptTurns().map(chatGptTurnIdentity).filter(Boolean)
                    );
                    this.chatGptEmptyRetryCount++;
                    this.scheduleChatGptEmptyFallback();
                    return false;
                }
                this.chatGptRouteAwaitingApiConfirmation = false;
                const changed = this.scanChatGptDom({ cacheMessages: true });
                return changed || this.order.length > 0;
            }
            if (this.chatGptEmptyFallbackTimer) clearTimeout(this.chatGptEmptyFallbackTimer);
            this.chatGptEmptyFallbackTimer = null;
            this.chatGptEmptyBaselineIdentities = null;
            this.chatGptEmptyRetryCount = 0;
            if (this.chatGptRouteAwaitingApiConfirmation) {
                // First confirmed payload for a new route is authoritative. Drop any DOM
                // message fallback captured during the URL/React transition before importing it.
                // The heading cache is already route-reset and identity-keyed, so retaining
                // it preserves headings from B nodes that mounted before B's API completed.
                this.records.clear();
                this.order = [];
                this.nextSequence = 0;
                this.chatGptRouteAwaitingApiConfirmation = false;
            }
            this.chatGptCanonicalTurnIds = new Set(apiRecords.map(record => record.id));
            const acceptedDomIdentities = Array.from(this.lastChatGptTurnIdentities)
                .filter(identity => !this.excludedChatGptTurnIdentities.has(identity));
            this.lastChatGptTurnIdentities = new Set([
                ...apiRecords.map(record => `id:${record.id}`),
                ...acceptedDomIdentities
            ]);
            // API records are canonical where available, but mounted DOM-only turns may be newer
            // than a cached payload. Merge instead of clearing so scrolling/new output is never erased.
            const apiIds = new Set(apiRecords.map(record => record.id));
            for (const [id, record] of this.records) {
                if (record.source === 'api' && !apiIds.has(id)) {
                    this.records.delete(id);
                    this.order = this.order.filter(recordId => recordId !== id);
                }
            }
            apiRecords.forEach(record => this.upsert({ ...record, source: 'api' }));
            this.title = cleanText(payload.title) || this.title;
            return this.order.length > 0;
        }

        getMountedChatGptTurns() {
            const root = document.querySelector('main') || document.querySelector('[role="main"]');
            if (!root?.querySelectorAll) return [];
            let mountedTurns = Array.from(root.querySelectorAll('[data-turn]'));
            if (mountedTurns.length === 0) {
                // ChatGPT now renders conversation turns as SECTION elements. Role and
                // API message IDs live on descendant message nodes, and one assistant
                // SECTION can contain both a progress message and the final answer.
                mountedTurns = Array.from(root.querySelectorAll('[data-message-author-role]'));
            }
            return mountedTurns.slice(-MAX_MOUNTED_CHATGPT_TURNS);
        }

        scheduleChatGptEmptyFallback() {
            if (this.chatGptEmptyFallbackTimer) clearTimeout(this.chatGptEmptyFallbackTimer);
            this.chatGptEmptyFallbackTimer = null;
            // Time alone is not route evidence. After three empty API responses keep
            // the index gated until mounted identities change or a non-empty payload arrives.
            if (this.chatGptEmptyRetryCount >= 3) return;
            const retryUrl = location.href;
            const retryGeneration = this.routeGeneration;
            this.chatGptEmptyFallbackTimer = setTimeout(() => {
                this.chatGptEmptyFallbackTimer = null;
                if (location.href !== retryUrl || this.routeGeneration !== retryGeneration) return;
                this.loadChatGptApi({ force: true }).then(loaded => {
                    if (loaded && location.href === retryUrl && this.routeGeneration === retryGeneration) {
                        window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
                    }
                });
            }, 350);
        }

        scanChatGptDom({ cacheMessages = true } = {}) {
            let changed = false;
            const existingTurns = new Set(this.getMessages().map(message => `${message.role}:${message.turnNumber}`));
            let mountedTurns = this.getMountedChatGptTurns();
            if (this.excludedChatGptTurnIdentities.size > 0) {
                mountedTurns = mountedTurns.filter(element => {
                    const identity = chatGptTurnIdentity(element);
                    return !identity || !this.excludedChatGptTurnIdentities.has(identity);
                });
            }
            if (this.chatGptCanonicalTurnIds.size > 0) {
                const firstCanonicalIndex = mountedTurns.findIndex(element => {
                    return chatGptElementIds(element).some(id => this.chatGptCanonicalTurnIds.has(id));
                });
                // With no previous-route identities to filter, a canonical B anchor is
                // required before any mounted DOM can be attributed to B. Discard nodes
                // before the first anchor; they may be A remnants during React replacement.
                if (firstCanonicalIndex < 0
                    && this.excludedChatGptTurnIdentities.size === 0
                    && !this.chatGptDomRouteTrusted) return false;
                if (firstCanonicalIndex >= 0) {
                    mountedTurns = mountedTurns.slice(firstCanonicalIndex);
                    this.chatGptDomRouteTrusted = true;
                }
            }
            if (this.chatGptRouteAwaitingApiConfirmation && this.excludedChatGptTurnIdentities.size === 0) {
                const currentIdentities = new Set(mountedTurns.map(chatGptTurnIdentity).filter(Boolean));
                const baseline = this.chatGptEmptyBaselineIdentities;
                const identitiesChanged = baseline instanceof Set
                    && (currentIdentities.size !== baseline.size
                        || Array.from(currentIdentities).some(identity => !baseline.has(identity)));
                if (!identitiesChanged) return false;
                this.chatGptRouteAwaitingApiConfirmation = false;
                this.chatGptEmptyBaselineIdentities = null;
                this.chatGptEmptyRetryCount = 0;
                this.chatGptDomRouteTrusted = true;
                if (this.chatGptEmptyFallbackTimer) clearTimeout(this.chatGptEmptyFallbackTimer);
                this.chatGptEmptyFallbackTimer = null;
            }
            if (mountedTurns.length === 0) return false;
            if (this.excludedChatGptTurnIdentities.size > 0) this.chatGptDomRouteTrusted = true;
            const currentIdentities = mountedTurns.map(chatGptTurnIdentity).filter(Boolean);
            if (currentIdentities.length > 0) this.lastChatGptTurnIdentities = new Set(currentIdentities);
            mountedTurns.forEach((element, index) => {
                const role = element.getAttribute('data-turn') || element.getAttribute('data-message-author-role');
                if (role !== 'user' && role !== 'assistant') return;
                const container = chatGptTurnContainer(element);
                const messageId = element.getAttribute('data-message-id') || null;
                const containerTurnId = container?.getAttribute?.('data-turn-id') || null;
                const turnId = messageId || element.getAttribute('data-turn-id') || containerTurnId;
                const indexedTurnNumber = turnId ? this.records.get(turnId)?.turnNumber : null;
                const turnTestId = element.getAttribute('data-testid') || container?.getAttribute?.('data-testid') || '';
                const turnNumber = Number(turnTestId.match(/conversation-turn-(\d+)/)?.[1]) || indexedTurnNumber || index + 1;
                if (role === 'assistant') {
                    const headings = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6'))
                        .map((heading, headingIndex) => ({
                            text: cleanText(heading.textContent),
                            level: heading.tagName.toLowerCase(),
                            headingIndex
                        }))
                        .filter(heading => heading.text);
                    if (headings.length > 0) {
                        const nextKey = headings.map(heading => `${heading.level}:${heading.text}`).join('|');
                        const headingKeys = Array.from(new Set([
                            messageId,
                            containerTurnId,
                            `turn:${turnNumber}`
                        ].filter(Boolean)));
                        headingKeys.forEach(headingKey => {
                            const previous = this.chatGptDomHeadings.get(headingKey) || [];
                            const previousKey = previous.map(heading => `${heading.level}:${heading.text}`).join('|');
                            if (previousKey !== nextKey) {
                                this.chatGptDomHeadings.set(headingKey, headings);
                                changed = true;
                            }
                        });
                    } else if (messageId && this.chatGptDomHeadings.delete(messageId)) {
                        // Do not clear the shared SECTION/turn fallback: a sibling final
                        // answer in the same SECTION may own those headings.
                        changed = true;
                    }
                }
                const turnKey = `${role}:${turnNumber}`;
                // API 记录保留原始 Markdown；但 API 缓存之后新挂载的 turn 仍需从 DOM 增量补入。
                if (!cacheMessages && ((turnId && this.records.has(turnId)) || existingTurns.has(turnKey))) return;
                const text = stripChatGptRolePrefix(element.textContent, role);
                const fallbackId = `chatgpt-${role}-turn-${turnNumber}-${text.slice(0, 80)}`;
                const recordId = messageId || turnId || fallbackId;
                // Never flatten and overwrite richer API Markdown for the same stable message.
                if (this.records.get(recordId)?.source === 'api') return;
                changed = this.upsert({
                    id: recordId,
                    turnId,
                    turnNumber,
                    role,
                    text,
                    markdown: text,
                    offset: null,
                    source: 'dom'
                }) || changed;
                existingTurns.add(turnKey);
            });
            return changed;
        }

        scheduleChatGptScan({ notify = true, delay = 240 } = {}) {
            if (this.chatGptScanTimer) clearTimeout(this.chatGptScanTimer);
            this.chatGptScanTimer = setTimeout(() => {
                this.chatGptScanTimer = null;
                const changed = this.scanChatGptDom({ cacheMessages: true });
                if (changed && notify) window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
            }, delay);
        }

        scanChatGptThrottled({ notify = true, interval = 220 } = {}) {
            const run = () => {
                this.lastChatGptScanAt = Date.now();
                const changed = this.scanChatGptDom({ cacheMessages: true });
                if (changed && notify) window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
            };
            const remaining = interval - (Date.now() - this.lastChatGptScanAt);
            if (remaining <= 0 || this.lastChatGptScanAt === 0) {
                if (this.chatGptTrailingTimer) clearTimeout(this.chatGptTrailingTimer);
                this.chatGptTrailingTimer = null;
                run();
                return;
            }
            if (this.chatGptTrailingTimer) return;
            this.chatGptTrailingTimer = setTimeout(() => {
                this.chatGptTrailingTimer = null;
                run();
            }, remaining);
        }

        observeChatGpt() {
            if (this.observer || this.platform !== 'CHATGPT') return;
            const root = document.querySelector('main') || document.querySelector('[role="main"]');
            if (!root) {
                if (!this.chatGptObserverRetryTimer) {
                    this.chatGptObserverRetryTimer = setTimeout(() => {
                        this.chatGptObserverRetryTimer = null;
                        this.observeChatGpt();
                    }, 500);
                }
                return;
            }
            this.observer = new MutationObserver(() => this.scheduleChatGptScan({ notify: true, delay: 240 }));
            this.observer.observe(root, { childList: true, subtree: true, characterData: true });
            // Capture scroll from ChatGPT's nested virtual scroller without guessing its class name.
            this.scrollTarget = window;
            this.scrollCapture = true;
            this.scrollListener = () => this.scanChatGptThrottled({ notify: true, interval: 220 });
            window.addEventListener('scroll', this.scrollListener, { passive: true, capture: true });
        }

        getChatGptDomHeadings(turnNumber, messageId = '') {
            // A supplied message ID is authoritative. Falling through to the same
            // numeric turn from another route can resurrect the previous chat's title.
            const headings = messageId
                ? (this.chatGptDomHeadings.get(messageId) || [])
                : (this.chatGptDomHeadings.get(`turn:${turnNumber}`) || []);
            return headings.map(heading => ({ ...heading }));
        }

        findDoubaoScroller() {
            return document.querySelector('[class*="v_list_scroller"]') || document.querySelector('[class*="scroller"]');
        }

        isDoubaoUserMessage(element) {
            return !!element.querySelector('[class*="send-msg"], [class*="send_message"], [class*="user-bubble"], [class*="bubble-bg"]');
        }

        scanDoubaoWindow() {
            const scroller = this.findDoubaoScroller();
            const scrollerRect = scroller?.getBoundingClientRect?.();
            let changed = false;
            Array.from(document.querySelectorAll('[data-message-id]')).forEach((element, index) => {
                const id = element.getAttribute('data-message-id') || `doubao-message-${index}`;
                const role = this.isDoubaoUserMessage(element) ? 'user' : 'assistant';
                const fingerprint = doubaoElementFingerprint(element, role);
                if (this.doubaoFingerprints.get(id) === fingerprint) return;
                const clone = element.cloneNode(true);
                clone.querySelectorAll('button, svg, script, style, [class*="avatar"], [class*="action"], [class*="tool"], [class*="time"], [class*="think"], [class*="collapse"]').forEach(node => node.remove());
                const text = cleanText(clone.textContent);
                const elementRect = element.getBoundingClientRect?.();
                // 虚拟列表会回收节点，但该坐标在消息被挂载时代表其真实列表位置。
                const offset = scroller && scrollerRect && elementRect
                    ? scroller.scrollTop + elementRect.top - scrollerRect.top
                    : null;
                changed = this.upsert({
                    id,
                    role,
                    text,
                    html: clone.innerHTML,
                    markdown: markdownFromHtml(clone.innerHTML, text),
                    offset,
                    windowIndex: index
                }) || changed;
                this.doubaoFingerprints.set(id, fingerprint);
            });
            return changed;
        }

        scheduleDoubaoScan({ notify = false, delay = 350 } = {}) {
            if (this.doubaoScanTimer) clearTimeout(this.doubaoScanTimer);
            this.doubaoScanTimer = setTimeout(() => {
                this.doubaoScanTimer = null;
                const changed = this.scanDoubaoWindow();
                if (changed && notify) window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
            }, delay);
        }

        scanDoubaoThrottled({ notify = true, interval = 220 } = {}) {
            const run = () => {
                this.lastDoubaoScanAt = Date.now();
                const changed = this.scanDoubaoWindow();
                if (changed && notify) window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
            };
            const remaining = interval - (Date.now() - this.lastDoubaoScanAt);
            if (remaining <= 0 || this.lastDoubaoScanAt === 0) {
                if (this.doubaoTrailingTimer) clearTimeout(this.doubaoTrailingTimer);
                this.doubaoTrailingTimer = null;
                run();
                return;
            }
            if (this.doubaoTrailingTimer) return;
            this.doubaoTrailingTimer = setTimeout(() => {
                this.doubaoTrailingTimer = null;
                run();
            }, remaining);
        }

        observeDoubao() {
            if (this.observer) return;
            const scroller = this.findDoubaoScroller() || document.body;
            this.observer = new MutationObserver(() => this.scheduleDoubaoScan({ notify: true, delay: 500 }));
            this.observer.observe(scroller, { childList: true, subtree: true, characterData: true });
            this.scrollTarget = scroller;
            // leading + trailing throttle：连续滚动时约每 220ms 捕获一次虚拟窗口，停止后再补最后一次。
            this.scrollListener = () => this.scanDoubaoThrottled({ notify: true, interval: 220 });
            scroller.addEventListener('scroll', this.scrollListener, { passive: true });
        }

        toUnifiedData() {
            const conversations = [];
            let pending = null;
            this.getMessages().forEach(message => {
                if (message.role === 'user') {
                    pending = message;
                } else if (message.role === 'assistant' && pending) {
                    conversations.push({
                        question: pending.text,
                        answer: { content: message.markdown || message.text },
                        messageIds: { question: pending.id, answer: message.id }
                    });
                    pending = null;
                }
            });
            return {
                title: this.title || conversations[0]?.question?.slice(0, 50) || 'chat',
                conversations,
                platform: this.platform === 'CHATGPT' ? 'ChatGPT' : 'Doubao',
                url: this.url,
                indexed: true,
                passiveIndex: this.platform === 'DOUBAO'
            };
        }

        snapshot() {
            return { platform: this.platform, title: this.title, messages: this.getMessages(), url: this.url };
        }
    }

    // 扩展更新后 content script 会再次注入到同一页面；不能继续复用旧类实例，
    // 否则新版本的 Markdown 保真与标题解析逻辑不会生效。
    const existingIndex = window.AI_CHAT_CONVERSATION_INDEX;
    if (!existingIndex || existingIndex.version !== INDEX_VERSION) {
        existingIndex?.disconnect?.();
        window.AI_CHAT_CONVERSATION_INDEX = new ConversationIndex();
    } else {
        existingIndex.connect?.();
    }
    window.__AI_CHAT_EXPORT_TESTS__ = {
        currentBranchNodes,
        contentToMarkdown,
        contentToText,
        stripChatGptRolePrefix,
        stableTextFingerprint,
        chatGptTurnIdentity,
        doubaoElementFingerprint
    };
})();
