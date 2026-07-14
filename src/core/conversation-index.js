(function () {
    'use strict';

    const CHATGPT_API = /chatgpt\.com/;
    const DOUBAO = /doubao\.com/;
    const INDEX_VERSION = '2026-07-14-bounded-cache';
    const CHATGPT_REQUEST_TIMEOUT_MS = 20000;
    const MAX_CACHED_CONVERSATIONS = 2;
    const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const stripChatGptRolePrefix = (value, role) => {
        const text = cleanText(value);
        if (role === 'user') return text.replace(/^(?:你说|You said)\s*[:：]\s*/i, '');
        if (role === 'assistant') return text.replace(/^ChatGPT\s*(?:说|said)\s*[:：]\s*/i, '');
        return text;
    };

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
            this.doubaoScanTimer = null;
            this.doubaoTrailingTimer = null;
            this.lastDoubaoScanAt = 0;
            this.doubaoFingerprints = new Map();
            this.chatGptPayloadCache = new Map();
            this.chatGptLoads = new Map();
            this.pendingChatGptRequests = new Map();
            this.connected = false;
            this.handleWindowMessage = event => {
                if (event.source !== window || event.origin !== location.origin) return;
                const message = event.data;
                if (message?.source !== 'ai-chat-export-pro') return;
                if (message.type === 'chatgpt-conversation' && message.payload) {
                    const conversationId = message.conversationId || currentConversationId();
                    this.cacheChatGptPayload(conversationId, message.payload);
                    const isCurrentConversation = conversationId === currentConversationId();
                    if (isCurrentConversation) this.importChatGptPayload(message.payload);
                    this.finishChatGptRequest(message.requestId, null, message.payload);
                    // 即使请求已超时，迟到的成功 payload 仍应刷新当前目录。
                    if (isCurrentConversation && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
                    }
                } else if (message.type === 'chatgpt-conversation-error') {
                    this.finishChatGptRequest(message.requestId, new Error(message.error || 'ChatGPT API unavailable'));
                }
            };
            this.connect();
        }

        cacheChatGptPayload(conversationId, payload) {
            if (!conversationId) return;
            this.chatGptPayloadCache.delete(conversationId);
            this.chatGptPayloadCache.set(conversationId, payload);
            while (this.chatGptPayloadCache.size > MAX_CACHED_CONVERSATIONS) {
                this.chatGptPayloadCache.delete(this.chatGptPayloadCache.keys().next().value);
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
            this.disconnectObservers();
            this.url = nextUrl;
            this.platform = CHATGPT_API.test(nextUrl) ? 'CHATGPT' : (DOUBAO.test(nextUrl) ? 'DOUBAO' : '');
            this.records.clear();
            this.order = [];
            this.chatGptDomHeadings.clear();
            this.doubaoFingerprints.clear();
            this.nextSequence = 0;
            this.title = document.title || '';
        }

        disconnectObservers() {
            if (this.observer) this.observer.disconnect();
            this.observer = null;
            if (this.doubaoScanTimer) clearTimeout(this.doubaoScanTimer);
            this.doubaoScanTimer = null;
            if (this.doubaoTrailingTimer) clearTimeout(this.doubaoTrailingTimer);
            this.doubaoTrailingTimer = null;
            if (this.scrollTarget && this.scrollListener) {
                this.scrollTarget.removeEventListener('scroll', this.scrollListener);
            }
            this.scrollTarget = null;
            this.scrollListener = null;
        }

        disconnect() {
            this.disconnectObservers();
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
                const apiLoaded = await this.loadChatGptApi(options);
                // SPA 切换可能发生在 API 等待期间；旧请求只缓存，不能生成新会话的目录。
                if (location.href !== refreshUrl) return this.refresh(options);
                // API 提供完整消息顺序；DOM 提供 ChatGPT 实际渲染出的标题，两者必须并行缓存。
                this.scanChatGptDom({ cacheMessages: !apiLoaded });
            } else if (this.platform === 'DOUBAO') {
                this.scanDoubaoWindow();
                if (options.observe !== false) this.observeDoubao();
            }
            return this.snapshot();
        }

        async loadChatGptApi({ force = false } = {}) {
            const conversationId = currentConversationId();
            if (!conversationId) return false;
            if (!force && this.chatGptPayloadCache.has(conversationId)) {
                const payload = this.chatGptPayloadCache.get(conversationId);
                this.cacheChatGptPayload(conversationId, payload);
                this.importChatGptPayload(payload);
                return this.order.length > 0;
            }
            if (this.chatGptLoads.has(conversationId)) return this.chatGptLoads.get(conversationId);

            const requestId = `${conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
            const load = new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pendingChatGptRequests.delete(requestId);
                    reject(new Error('ChatGPT conversation request timed out'));
                }, CHATGPT_REQUEST_TIMEOUT_MS);
                this.pendingChatGptRequests.set(requestId, { resolve, reject, timer });
                window.postMessage({
                    source: 'ai-chat-exporter-index',
                    type: 'chatgpt-conversation-request',
                    requestId,
                    conversationId,
                    force
                }, location.origin);
            }).then(payload => {
                this.cacheChatGptPayload(conversationId, payload);
                if (conversationId !== currentConversationId()) return false;
                this.importChatGptPayload(payload);
                return this.order.length > 0;
            }).catch(error => {
                console.warn('AI Chat Export Pro: ChatGPT API unavailable; using mounted DOM', error);
                if (conversationId === currentConversationId()) this.scanChatGptDom();
                return false;
            }).finally(() => this.chatGptLoads.delete(conversationId));
            this.chatGptLoads.set(conversationId, load);
            return load;
        }

        importChatGptPayload(payload) {
            if (!payload?.mapping) return false;
            let turnNumber = 0;
            currentBranchNodes(payload).forEach(node => {
                const role = node?.message?.author?.role;
                if (role !== 'user' && role !== 'assistant') return;
                turnNumber++;
                const markdown = contentToMarkdown(node.message.content);
                const text = cleanText(markdown);
                this.upsert({
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
            this.title = cleanText(payload.title) || this.title;
            return this.order.length > 0;
        }

        scanChatGptDom({ cacheMessages = true } = {}) {
            const existingTurns = new Set(this.getMessages().map(message => `${message.role}:${message.turnNumber}`));
            Array.from(document.querySelectorAll('[data-turn]')).forEach((element, index) => {
                const role = element.getAttribute('data-turn');
                const turnNumber = Number((element.getAttribute('data-testid') || '').match(/conversation-turn-(\d+)/)?.[1]) || index + 1;
                if (role === 'assistant') {
                    const headings = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6'))
                        .map((heading, headingIndex) => ({
                            text: cleanText(heading.textContent),
                            level: heading.tagName.toLowerCase(),
                            headingIndex
                        }))
                        .filter(heading => heading.text);
                    if (headings.length > 0) this.chatGptDomHeadings.set(turnNumber, headings);
                }
                const turnId = element.getAttribute('data-turn-id') || null;
                const turnKey = `${role}:${turnNumber}`;
                // API 记录保留原始 Markdown；但 API 缓存之后新挂载的 turn 仍需从 DOM 增量补入。
                if (!cacheMessages && ((turnId && this.records.has(turnId)) || existingTurns.has(turnKey))) return;
                const text = stripChatGptRolePrefix(element.textContent, role);
                this.upsert({
                    id: turnId || `chatgpt-turn-${index}`,
                    turnId,
                    turnNumber,
                    role,
                    text,
                    markdown: text,
                    offset: null
                });
                existingTurns.add(turnKey);
            });
        }

        getChatGptDomHeadings(turnNumber) {
            return (this.chatGptDomHeadings.get(turnNumber) || []).map(heading => ({ ...heading }));
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
        doubaoElementFingerprint
    };
})();
