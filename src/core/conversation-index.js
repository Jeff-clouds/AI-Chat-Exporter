(function () {
    'use strict';

    const CHATGPT_API = /chatgpt\.com/;
    const DOUBAO = /doubao\.com/;
    const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();

    function currentConversationId() {
        const match = location.pathname.match(/\/c\/([^/?#]+)|\/chat\/([^/?#]+)/);
        return match ? (match[1] || match[2]) : '';
    }

    function contentToText(content) {
        const parts = content?.parts;
        if (!Array.isArray(parts)) return cleanText(content?.text || '');
        return cleanText(parts.map(part => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            return '';
        }).join('\n'));
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

    class ConversationIndex {
        constructor() {
            this.url = '';
            this.platform = '';
            this.records = new Map();
            this.order = [];
            this.nextSequence = 0;
            this.title = '';
            this.observer = null;
            this.scrollTarget = null;
            this.scrollListener = null;
            this.lastDoubaoScan = 0;
            window.addEventListener('message', event => {
                if (event.source !== window || event.origin !== location.origin) return;
                const message = event.data;
                if (message?.source !== 'ai-chat-export-pro' || message.type !== 'chatgpt-conversation') return;
                this.importChatGptPayload(message.payload);
            });
        }

        resetForLocation() {
            const nextUrl = location.href;
            if (nextUrl === this.url) return;
            this.disconnect();
            this.url = nextUrl;
            this.platform = CHATGPT_API.test(nextUrl) ? 'CHATGPT' : (DOUBAO.test(nextUrl) ? 'DOUBAO' : '');
            this.records.clear();
            this.order = [];
            this.nextSequence = 0;
            this.title = document.title || '';
        }

        disconnect() {
            if (this.observer) this.observer.disconnect();
            this.observer = null;
            if (this.scrollTarget && this.scrollListener) {
                this.scrollTarget.removeEventListener('scroll', this.scrollListener);
            }
            this.scrollTarget = null;
            this.scrollListener = null;
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
            this.resetForLocation();
            if (this.platform === 'CHATGPT') {
                await this.loadChatGptApi();
            } else if (this.platform === 'DOUBAO') {
                this.scanDoubaoWindow();
                this.observeDoubao();
            }
            return this.snapshot();
        }

        async loadChatGptApi() {
            const conversationId = currentConversationId();
            if (!conversationId) return false;
            try {
                const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}?offset=0&limit=100000`, {
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                this.importChatGptPayload(await response.json());
                return this.order.length > 0;
            } catch (error) {
                console.warn('AI Chat Export Pro: ChatGPT API unavailable; using mounted DOM', error);
                this.scanChatGptDom();
                return false;
            }
        }

        importChatGptPayload(payload) {
            if (!payload?.mapping) return false;
            currentBranchNodes(payload).forEach((node, index) => {
                const role = node?.message?.author?.role;
                if (role !== 'user' && role !== 'assistant') return;
                const text = contentToText(node.message.content);
                this.upsert({
                    id: node.message.id || node.id,
                    turnId: node.message.id || node.id,
                    turnNumber: index + 1,
                    role,
                    text,
                    markdown: text,
                    offset: null
                });
            });
            this.title = cleanText(payload.title) || this.title;
            return this.order.length > 0;
        }

        scanChatGptDom() {
            Array.from(document.querySelectorAll('[data-turn]')).forEach((element, index) => {
                const role = element.getAttribute('data-turn');
                const text = cleanText(element.textContent);
                this.upsert({
                    id: element.getAttribute('data-turn-id') || `chatgpt-turn-${index}`,
                    turnId: element.getAttribute('data-turn-id') || null,
                    turnNumber: Number((element.getAttribute('data-testid') || '').match(/conversation-turn-(\d+)/)?.[1]) || index + 1,
                    role,
                    text,
                    markdown: text,
                    offset: null
                });
            });
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
            Array.from(document.querySelectorAll('[data-message-id]')).forEach((element, index) => {
                const clone = element.cloneNode(true);
                clone.querySelectorAll('button, svg, script, style, [class*="avatar"], [class*="action"], [class*="tool"], [class*="time"], [class*="think"], [class*="collapse"]').forEach(node => node.remove());
                const text = cleanText(clone.textContent);
                const elementRect = element.getBoundingClientRect?.();
                // 虚拟列表会回收节点，但该坐标在消息被挂载时代表其真实列表位置。
                const offset = scroller && scrollerRect && elementRect
                    ? scroller.scrollTop + elementRect.top - scrollerRect.top
                    : null;
                this.upsert({
                    id: element.getAttribute('data-message-id') || `doubao-message-${index}`,
                    role: this.isDoubaoUserMessage(element) ? 'user' : 'assistant',
                    text,
                    html: clone.innerHTML,
                    markdown: markdownFromHtml(clone.innerHTML, text),
                    offset,
                    windowIndex: index
                });
            });
        }

        observeDoubao() {
            if (this.observer) return;
            const scroller = this.findDoubaoScroller() || document.body;
            this.observer = new MutationObserver(() => this.scanDoubaoWindow());
            this.observer.observe(scroller, { childList: true, subtree: true, characterData: true });
            this.scrollTarget = scroller;
            this.scrollListener = () => {
                this.scanDoubaoWindow();
                window.dispatchEvent(new CustomEvent('ai-chat-index-updated'));
            };
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

    window.AI_CHAT_CONVERSATION_INDEX = window.AI_CHAT_CONVERSATION_INDEX || new ConversationIndex();
    window.__AI_CHAT_EXPORT_TESTS__ = { currentBranchNodes, contentToText };
})();
