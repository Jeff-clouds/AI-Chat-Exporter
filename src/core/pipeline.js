window.Pipeline = class Pipeline {
    static version = '2026-06-02-heading-level-normalization';

    constructor() {
        this.chatGptAnswerOutlineCache = new Map();
        this.chatGptCacheUrl = null;
        this.config = this._getPlatformConfig(window.location.href);
        if (this.config) {
            console.log(`AI Chat Export Pro: Identified platform ${this.config.name}`);
        } else {
            // 回退到通用配置
            this.config = window.SELECTORS.GENERIC;
            this.platformId = 'GENERIC';
            console.log('AI Chat Export Pro: No matching platform found, using Generic mode');
        }
    }

    _stripChatGptRolePrefix(value, role) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (this.platformId !== 'CHATGPT') return text;
        if (role === 'user') return text.replace(/^(?:你说|You said)\s*[:：]\s*/i, '');
        if (role === 'assistant') return text.replace(/^ChatGPT\s*(?:说|said)\s*[:：]\s*/i, '');
        return text;
    }

    _getPlatformConfig(url) {
        for (const key in window.SELECTORS) {
            if (key === 'GENERIC') continue;
            const config = window.SELECTORS[key];
            if (config.urlPatterns) {
                for (const pattern of config.urlPatterns) {
                    if (pattern instanceof RegExp) {
                        if (pattern.test(url)) {
                            this.platformId = key;
                            return config;
                        }
                    } else if (typeof pattern === 'string') {
                        if (url.includes(pattern)) {
                            this.platformId = key;
                            return config;
                        }
                    }
                }
            }
        }
        return null;
    }

    extract() {
        const diagnostics = {
            platform: this.platformId,
            url: window.location.href,
            configFound: !!this.config,
            strategy: 'unknown',
            error: null,
            stats: {
                conversations: 0,
                questions: 0,
                answers: 0,
                headings: 0
            }
        };

        try {
            if (!this.config) return { outline: [], diagnostics };

            const outline = [];

            // 1. 尝试识别对话容器 (Conversation Item Mode)
            // 只有显式配置 conversation 选择器的平台才进入 nested 模式。
            // 豆包这类页面会把多轮问答包在同一个大容器里，语义兜底误判为 conversation
            // 会导致 nested 模式只取第一问。
            const hasConversationSelector = !!(this.config.selectors && this.config.selectors.conversation);
            const items = hasConversationSelector
                ? window.SELECTOR_MANAGER.getElements(this.platformId, 'conversation')
                : [];
            diagnostics.stats.conversations = items.length;

            if (items.length > 0) {
                diagnostics.strategy = 'nested';
                this._extractNested(items, outline);
                
                if (outline.length > 0) {
                    const finalOutline = this._finalizeOutline(outline);
                    this._fillStats(finalOutline, diagnostics);
                    return { outline: finalOutline, diagnostics };
                }
            }

            // 2. 回退到扁平模式 (Flat Mode)
            diagnostics.strategy = 'flat';
            this._extractFlat(outline);
            const finalOutline = this._finalizeOutline(outline);
            this._fillStats(finalOutline, diagnostics);
            
            return { outline: finalOutline, diagnostics };
        } catch (err) {
            console.error('AI Chat Export Pro: Extraction error', err);
            diagnostics.error = err.message;
            return { outline: [], diagnostics };
        }
    }

    async extractWithIndex() {
        const diagnostics = {
            platform: this.platformId,
            url: window.location.href,
            configFound: !!this.config,
            strategy: 'message-index',
            error: null,
            stats: { conversations: 0, questions: 0, answers: 0, headings: 0 }
        };
        try {
            const indexedOutline = await this._extractVirtualizedOutline();
            if (indexedOutline.length > 0) {
                this._fillStats(indexedOutline, diagnostics);
                return { outline: indexedOutline, diagnostics };
            }
        } catch (error) {
            console.warn('AI Chat Export Pro: Virtual message index unavailable', error);
        }
        // ChatGPT 的完整 DOM 查询在真实长对话上可能长时间阻塞；API 不可用时宁可显示空目录，
        // 也不能回退到全页选择器扫描而影响聊天页面本身。
        if (this.platformId === 'CHATGPT') return { outline: [], diagnostics };
        return this.extract();
    }

    async _extractVirtualizedOutline() {
        if (this.platformId !== 'CHATGPT' && this.platformId !== 'DOUBAO') return [];
        const index = window.AI_CHAT_CONVERSATION_INDEX;
        if (!index) return [];
        // ChatGPT 只在侧栏生命周期内观察会话容器；滚动只做有界 DOM 增量扫描，
        // bridge 合并 API 请求并以精简当前分支异步升级目录。
        if (this.platformId === 'CHATGPT') {
            await index.refresh({ observe: true, awaitApi: false });
        } else {
            // 豆包被动索引：目录刷新绝不驱动页面滚动；只读取用户浏览时挂载的消息。
            await index.refresh();
        }
        const messages = index.getMessages();
        if (messages.length === 0) return [];

        const outline = [];
        let questionIndex = 0;
        let pendingQuestion = null;
        let pendingAnswerKeys = new Set();
        messages.forEach(message => {
            if (message.role === 'user') {
                pendingQuestion = message;
                pendingAnswerKeys = new Set();
                const questionId = `cn-q-${this._safeId(message.id)}`;
                const questionText = this._stripChatGptRolePrefix(message.text, 'user');
                const text = questionText.length > 50 ? `${questionText.slice(0, 50)}...` : questionText;
                outline.push({
                    text: `问题 ${questionIndex + 1}: ${text}`,
                    level: 'h1',
                    id: questionId,
                    type: 'question',
                    metadata: {
                        type: 'question', index: questionIndex, key: `message:${message.id}`,
                        messageId: message.id, turnId: message.turnId || null,
                        turnNumber: message.turnNumber || null, offset: message.offset
                    }
                });
                questionIndex++;
                return;
            }
            if (message.role !== 'assistant' || !pendingQuestion) return;
            const markdownHeadings = this._indexedHeadings(message).map((heading, headingIndex) => ({ ...heading, headingIndex }));
            const domHeadings = this.platformId === 'CHATGPT'
                ? index.getChatGptDomHeadings(message.turnNumber, message.id)
                : [];
            const headings = this._mergeIndexedHeadings(domHeadings, markdownHeadings);
            headings.forEach((heading, headingIndex) => {
                const answerKey = `${heading.level}:${this._stripChatGptRolePrefix(heading.text, 'assistant')}`;
                if (pendingAnswerKeys.has(answerKey)) return;
                pendingAnswerKeys.add(answerKey);
                outline.push({
                    text: heading.text,
                    level: heading.level,
                    id: `cn-a-${this._safeId(`${message.id}-${headingIndex}-${heading.text}`)}`,
                    type: 'answer',
                    metadata: {
                        type: 'answer', answerIndex: questionIndex - 1,
                        headingIndex: Number.isFinite(heading.headingIndex) ? heading.headingIndex : headingIndex,
                        questionIndex: questionIndex - 1, key: `message:${message.id}:${headingIndex}`,
                        messageId: message.id, turnId: message.turnId || null,
                        turnNumber: message.turnNumber || null, offset: message.offset
                    }
                });
            });
            // A current ChatGPT assistant turn can contain a progress/commentary
            // message followed by the final answer. Keep the question active until
            // the next user message so the first heading-less assistant record does
            // not consume the answer slot.
        });
        return outline;
    }

    _indexedHeadings(message) {
        const headings = [];
        if (message.html) {
            const container = document.createElement('div');
            container.innerHTML = message.html;
            container.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(element => {
                const text = element.textContent.trim();
                if (text) headings.push({ text, level: element.tagName.toLowerCase() });
            });
        }
        if (headings.length > 0) return headings;
        String(message.markdown || message.text || '').split('\n').forEach(line => {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) headings.push({ text: match[2].trim(), level: `h${match[1].length}` });
        });
        return headings;
    }

    _mergeIndexedHeadings(domHeadings, markdownHeadings) {
        const merged = [];
        const known = new Set();
        [...domHeadings, ...markdownHeadings].forEach(heading => {
            const normalizedText = this._stripChatGptRolePrefix(heading.text, 'assistant');
            const key = `${heading.level}:${normalizedText}`;
            if (!normalizedText || known.has(key)) return;
            known.add(key);
            merged.push({ ...heading, text: normalizedText });
        });
        return merged;
    }

    _fillStats(outline, diagnostics) {
        outline.forEach(item => {
            if (item.type === 'question') diagnostics.stats.questions++;
            else if (item.type === 'answer') diagnostics.stats.headings++;
        });
        // 注意：这里的 answers 数量在扁平模式下不直接等于 outline 项数
    }

    _finalizeOutline(outline) {
        if (this.platformId !== 'CHATGPT') return outline;
        if (this.chatGptCacheUrl !== window.location.href) {
            this.chatGptAnswerOutlineCache.clear();
            this.chatGptCacheUrl = window.location.href;
        }
        return this._augmentChatGptNativePrompts(outline);
    }

    _augmentChatGptNativePrompts(outline) {
        const { prefix, groups } = this._groupOutlineByQuestion(outline);
        const prompts = this._getChatGptNativePrompts();

        if (groups.length === 0 && prompts.length === 0) return outline;

        const groupsByTurn = new Map();
        groups.forEach(group => {
            const turnNumber = group.question?.metadata?.turnNumber;
            if (Number.isFinite(turnNumber) && !groupsByTurn.has(turnNumber)) {
                groupsByTurn.set(turnNumber, group);
            }
        });

        prompts.forEach(prompt => {
            if (groupsByTurn.has(prompt.turnNumber)) {
                const group = groupsByTurn.get(prompt.turnNumber);
                group.promptNumber = prompt.promptNumber;
                return;
            }

            const question = this._createChatGptPromptQuestion(prompt);
            const group = {
                question,
                answers: [],
                originalIndex: groups.length,
                promptNumber: prompt.promptNumber
            };
            groups.push(group);
            groupsByTurn.set(prompt.turnNumber, group);
        });

        const loadedAnswerTurns = this._attachChatGptLoadedAnswerHeadings(groupsByTurn);
        groupsByTurn.forEach((group, turnNumber) => {
            if (loadedAnswerTurns.has(turnNumber)) {
                if (group.answers.length > 0) {
                    this.chatGptAnswerOutlineCache.set(turnNumber, [...group.answers]);
                } else {
                    this.chatGptAnswerOutlineCache.delete(turnNumber);
                }
                return;
            }

            const cachedAnswers = this.chatGptAnswerOutlineCache.get(turnNumber) || [];
            const knownAnswerKeys = new Set(group.answers.map(answer => this._outlineAnswerKey(answer)));
            cachedAnswers.forEach(answer => {
                const key = this._outlineAnswerKey(answer);
                if (knownAnswerKeys.has(key)) return;
                knownAnswerKeys.add(key);
                group.answers.push(answer);
            });
        });

        const sortedGroups = groups
            .filter(group => group.question)
            .sort((a, b) => this._chatGptGroupOrder(a) - this._chatGptGroupOrder(b));

        const finalOutline = prompts.length > 0
            ? prefix.filter(item => item.type !== 'answer')
            : [...prefix];
        sortedGroups.forEach((group, index) => {
            finalOutline.push(this._withQuestionIndex(group.question, index));
            group.answers.forEach(answer => finalOutline.push(answer));
        });

        return finalOutline;
    }

    _attachChatGptLoadedAnswerHeadings(groupsByTurn) {
        const answers = this._sortElements(
            window.SELECTOR_MANAGER.getElements(this.platformId, 'answer')
        );
        const loadedAnswerTurns = new Set();

        answers.forEach((answerEl, answerIndex) => {
            const answerTurnNumber = this._turnInfo(answerEl).turnNumber;
            if (!Number.isFinite(answerTurnNumber) || answerTurnNumber % 2 !== 0) return;

            const questionTurnNumber = answerTurnNumber - 1;
            const group = groupsByTurn.get(questionTurnNumber);
            if (!group) return;
            loadedAnswerTurns.add(questionTurnNumber);

            const knownAnswerKeys = new Set(
                group.answers.map(answer => this._outlineAnswerKey(answer))
            );
            const answerOutline = [];
            this._processAnswerHeadings(answerEl, answerOutline, answerIndex, {
                questionIndex: group.question?.metadata?.index ?? null
            });

            answerOutline.forEach(answer => {
                const key = this._outlineAnswerKey(answer);
                if (knownAnswerKeys.has(key)) return;
                knownAnswerKeys.add(key);
                group.answers.push(answer);
            });
        });

        return loadedAnswerTurns;
    }

    _outlineAnswerKey(answer) {
        const metadata = answer.metadata || {};
        return metadata.key || `${metadata.turnNumber || ''}:${metadata.textKey || answer.text}`;
    }

    _groupOutlineByQuestion(outline) {
        const prefix = [];
        const groups = [];
        let currentGroup = null;

        outline.forEach(item => {
            if (item.type === 'question') {
                currentGroup = {
                    question: item,
                    answers: [],
                    originalIndex: groups.length,
                    promptNumber: item.metadata?.promptNumber || null
                };
                groups.push(currentGroup);
                return;
            }

            if (currentGroup) {
                currentGroup.answers.push(item);
            } else {
                prefix.push(item);
            }
        });

        return { prefix, groups };
    }

    _getChatGptNativePrompts() {
        const buttons = Array.from(document.querySelectorAll('button[aria-label^="Prompt"]'));
        return buttons
            .map(button => {
                const label = button.getAttribute('aria-label') || '';
                const match = label.match(/^Prompt\s+(\d+)$/i);
                if (!match) return null;

                const promptNumber = Number(match[1]);
                const turnNumber = promptNumber * 2 - 1;
                const turn = document.querySelector(`[data-testid="conversation-turn-${turnNumber}"][data-turn="user"]`);
                const rawText = this._stripChatGptRolePrefix(turn?.textContent || button.textContent || label, 'user');

                return {
                    promptNumber,
                    turnNumber,
                    turnId: turn?.getAttribute('data-turn-id') || null,
                    key: turn ? this._elementKey(turn, 'question') : `question:chatgpt-prompt:${promptNumber}`,
                    textKey: this._hash(rawText),
                    text: rawText || label
                };
            })
            .filter(Boolean);
    }

    _createChatGptPromptQuestion(prompt) {
        const stableId = `cn-q-chatgpt-prompt-${prompt.promptNumber}`;
        const text = prompt.text.length > 50 ? prompt.text.substring(0, 50) + '...' : prompt.text;

        return {
            text: `问题 ${prompt.promptNumber}: ${text}`,
            level: 'h1',
            id: stableId,
            type: 'question',
            metadata: {
                type: 'question',
                index: prompt.promptNumber - 1,
                key: prompt.key,
                textKey: prompt.textKey,
                turnId: prompt.turnId,
                turnNumber: prompt.turnNumber,
                promptNumber: prompt.promptNumber,
                nativePrompt: true
            }
        };
    }

    _withQuestionIndex(question, index) {
        const text = question.text.replace(/^问题\s+\d+\s*:\s*/, '');
        const promptNumber = question.metadata?.promptNumber || this._promptNumberFromTurn(question.metadata?.turnNumber);

        return {
            ...question,
            text: `问题 ${index + 1}: ${text}`,
            metadata: {
                ...(question.metadata || {}),
                index,
                promptNumber
            }
        };
    }

    _chatGptGroupOrder(group) {
        const metadata = group.question?.metadata || {};
        if (Number.isFinite(metadata.turnNumber)) return metadata.turnNumber;
        if (Number.isFinite(metadata.promptNumber)) return metadata.promptNumber * 2 - 1;
        return Number.MAX_SAFE_INTEGER - (100000 - group.originalIndex);
    }

    _promptNumberFromTurn(turnNumber) {
        if (!Number.isFinite(turnNumber)) return null;
        if (turnNumber % 2 !== 1) return null;
        return (turnNumber + 1) / 2;
    }

    _extractNested(items, outline) {
        items.forEach((item, index) => {
            const questions = window.SELECTOR_MANAGER.getElements(this.platformId, 'question', item);
            const answers = window.SELECTOR_MANAGER.getElements(this.platformId, 'answer', item);

            if (questions.length > 0 && answers.length > 0) {
                this._addQuestionToOutline(questions[0], index, outline);
                this._processAnswerHeadings(answers[0], outline, index);
            }
        });
    }

    _extractFlat(outline) {
        const questions = this._sortElements(
            window.SELECTOR_MANAGER.getElements(this.platformId, 'question')
        ).filter(question => question.textContent.trim());
        const answers = this._sortElements(
            window.SELECTOR_MANAGER.getElements(this.platformId, 'answer')
        );

        if (questions.length === 0) {
            answers.forEach((answer, index) => {
                this._processAnswerHeadings(answer, outline, index);
            });
            return;
        }

        if (this._extractAnswerContainersByContainedQuestions(questions, answers, outline)) {
            return;
        }

        questions.forEach((questionEl, questionIndex) => {
            this._addQuestionToOutline(questionEl, questionIndex, outline);

            const nextQuestionEl = questions[questionIndex + 1] || null;
            const relatedAnswers = answers.filter(answerEl => {
                if (answerEl === questionEl) return false;

                if (answerEl.contains(questionEl)) {
                    return true;
                }

                const isAfterCurrent =
                    window.compareElementsByPosition(answerEl, questionEl) > 0;
                if (!isAfterCurrent) return false;

                if (!nextQuestionEl) return true;

                return window.compareElementsByPosition(answerEl, nextQuestionEl) < 0;
            });

            relatedAnswers.forEach(answerEl => {
                const answerIndex = answers.indexOf(answerEl);
                const segmentOptions = answerEl.contains(questionEl)
                    ? {
                        questionIndex,
                        segmentKey: `q-${questionIndex}`,
                        startAfter: questionEl,
                        endBefore: nextQuestionEl && answerEl.contains(nextQuestionEl) ? nextQuestionEl : null
                    }
                    : {
                        questionIndex,
                        segmentKey: `q-${questionIndex}`,
                        endBefore: nextQuestionEl
                    };

                this._processAnswerHeadings(answerEl, outline, answerIndex, segmentOptions);
            });
        });
    }

    _sortElements(elements) {
        return [...elements].sort((a, b) => window.compareElementsByPosition(a, b));
    }

    _extractAnswerContainersByContainedQuestions(questions, answers, outline) {
        const { features = {} } = this.config;
        if (!features.segmentSingleAnswerByQuestions) return false;
        if (questions.length < 2 || answers.length === 0) return false;

        const segmentContainers = answers
            .map((answerEl, answerIndex) => ({
                answerEl,
                answerIndex,
                containedQuestions: questions.filter(question => answerEl.contains(question))
            }))
            .filter(item => item.containedQuestions.length >= 2);

        if (segmentContainers.length === 0) return false;

        const handledQuestions = new Set();

        segmentContainers.forEach(({ answerEl, answerIndex, containedQuestions }) => {
            containedQuestions.forEach(questionEl => {
                if (handledQuestions.has(questionEl)) return;

                const questionIndex = questions.indexOf(questionEl);
                const localQuestionIndex = containedQuestions.indexOf(questionEl);

                this._addQuestionToOutline(questionEl, questionIndex, outline);
                this._processAnswerHeadings(answerEl, outline, answerIndex, {
                    questionIndex,
                    segmentKey: `q-${questionIndex}`,
                    startAfter: questionEl,
                    endBefore: containedQuestions[localQuestionIndex + 1] || null
                });

                handledQuestions.add(questionEl);
            });
        });

        return handledQuestions.size > 0;
    }

    _addQuestionToOutline(questionEl, index, outline) {
        // 使用稳定 ID
        const key = this._elementKey(questionEl, 'question');
        const stableId = `cn-q-${this._safeId(key || index)}`;
        if (questionEl.id !== stableId) questionEl.id = stableId;
        
        let text = this._stripChatGptRolePrefix(questionEl.textContent, 'user');
        if (!text) return;
        if (text.length > 50) text = text.substring(0, 50) + '...';
        const turnInfo = this._turnInfo(questionEl);
        
        outline.push({
            text: `问题 ${index + 1}: ${text}`,
            level: 'h1',
            id: questionEl.id,
            type: 'question',
            metadata: {
                type: 'question',
                index: index,
                key: key,
                textKey: this._textKey(questionEl),
                turnId: turnInfo.turnId,
                turnNumber: turnInfo.turnNumber
            }
        });
    }

    _processAnswerHeadings(answerElement, outline, answerIndex, options = {}) {
        const { features } = this.config;
        const {
            startAfter = null,
            endBefore = null,
            questionIndex = null,
            segmentKey = 'default'
        } = options;
        
        // 默认 H1-H6 或配置的标题选择器
        const headingsConfig = this.config.selectors.HEADINGS || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        const allHeadings = [];

        headingsConfig.forEach((selector, index) => {
            // 使用智能提取或直接查询
            const headings = answerElement.querySelectorAll(selector);
            
            headings.forEach(heading => {
                // 特性处理：如果开启了 removeThinking，且该标题位于 thinking 容器内，则跳过
                if (features && features.removeThinking) {
                    const thinkingEls = window.SELECTOR_MANAGER.getElements(this.platformId, 'thinking', answerElement);
                    if (thinkingEls.some(t => t.contains(heading))) {
                        return; 
                    }
                }
                
                // 忽略辅助阅读文本 (如 "ChatGPT说")
                if (heading.classList.contains('sr-only')) return;

                // 跳过空标题
                if (!heading.textContent.trim()) return;

                if (startAfter && window.compareElementsByPosition(heading, startAfter) <= 0) {
                    return;
                }

                if (endBefore && window.compareElementsByPosition(heading, endBefore) >= 0) {
                    return;
                }

                allHeadings.push({
                    element: heading,
                    level: index + 1
                });
            });
        });

        // 如果没有找到标题，尝试智能提取
        if (allHeadings.length === 0) {
            const smartHeadings = window.SELECTOR_MANAGER.getElements(this.platformId, 'HEADINGS', answerElement);
            smartHeadings.forEach(heading => {
                if (startAfter && window.compareElementsByPosition(heading, startAfter) <= 0) {
                    return;
                }

                if (endBefore && window.compareElementsByPosition(heading, endBefore) >= 0) {
                    return;
                }

                allHeadings.push({
                    element: heading,
                    level: 2 // 默认二级
                });
            });
        }

        // 按文档位置排序
        const sortedHeadings = sortElementsByDocumentPosition(allHeadings);

        sortedHeadings.forEach(({element, level}, headingIndex) => {
            const normalizedLevel = Math.min(6, Math.max(2, level));
            // 使用稳定 ID
            const key = this._elementKey(element, 'heading');
            const stableIdPart = key
                ? `${segmentKey}-${key}-${headingIndex}`
                : `${answerIndex}-${segmentKey}-${headingIndex}`;
            const stableId = `cn-a-${this._safeId(stableIdPart)}`;
            if (element.id !== stableId) element.id = stableId;
            const turnInfo = this._turnInfo(element);
            
            const headingText = this._stripChatGptRolePrefix(element.textContent, 'assistant');
            if (!headingText) return;
            outline.push({
                text: headingText,
                level: `h${normalizedLevel}`,
                id: element.id,
                type: 'answer',
                metadata: {
                    type: 'answer',
                    answerIndex: answerIndex,
                    headingIndex: headingIndex,
                    questionIndex: questionIndex,
                    key: key,
                    textKey: this._textKey(element),
                    turnId: turnInfo.turnId,
                    turnNumber: turnInfo.turnNumber,
                    segmented: !!startAfter || !!endBefore
                }
            });
        });
    }

    _elementKey(element, type) {
        const stableAttr = this._closestAttr(element, [
            'data-message-id',
            'data-turn-id',
            'data-id'
        ]);
        if (type === 'heading') {
            const parentKey = stableAttr ? `${stableAttr.name}:${stableAttr.value}` : 'text';
            return `${type}:${parentKey}:${this._textKey(element)}`;
        }
        if (stableAttr) return `${type}:${stableAttr.name}:${stableAttr.value}`;
        return `${type}:text:${this._textKey(element)}`;
    }

    _turnInfo(element) {
        const turn = element.closest?.('[data-testid^="conversation-turn-"]');
        const turnId = turn?.getAttribute('data-turn-id') || null;
        const match = turn?.getAttribute('data-testid')?.match(/conversation-turn-(\d+)/);
        return {
            turnId,
            turnNumber: match ? Number(match[1]) : null
        };
    }

    _closestAttr(element, names) {
        let current = element;
        while (current && current instanceof Element) {
            for (const name of names) {
                const value = current.getAttribute(name);
                if (value) return { name, value };
            }
            current = current.parentElement;
        }
        return null;
    }

    _textKey(element) {
        return this._hash((element.textContent || '').replace(/\s+/g, ' ').trim());
    }

    _hash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    }

    _safeId(value) {
        return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    }

    // 根据元数据查找元素
    findElement(metadata) {
        if (!this.config || !metadata) return null;

        if (metadata.type === 'question') {
            const questions = this._sortElements(
                window.SELECTOR_MANAGER.getElements(this.platformId, 'question')
            ).filter(question => question.textContent.trim());
            const keyedQuestion = this._findByMetadata(questions, metadata, 'question');
            if (keyedQuestion) return keyedQuestion;
            if (metadata.key || metadata.textKey || Number.isFinite(metadata.turnNumber)) return null;
            return questions[metadata.index] || null;
        } else if (metadata.type === 'answer') {
            const answers = this._sortElements(
                window.SELECTOR_MANAGER.getElements(this.platformId, 'answer')
            );
            const answerEl = answers.find(answer => {
                const turnInfo = this._turnInfo(answer);
                if (metadata.turnId && turnInfo.turnId === metadata.turnId) return true;
                return Number.isFinite(metadata.turnNumber)
                    && turnInfo.turnNumber === metadata.turnNumber;
            }) || (
                !metadata.turnId && !Number.isFinite(metadata.turnNumber)
                    ? answers[metadata.answerIndex]
                    : null
            );
            if (!answerEl) return null;

            const questions = this._sortElements(
                window.SELECTOR_MANAGER.getElements(this.platformId, 'question')
            ).filter(question => question.textContent.trim());
            const segmentQuestion = typeof metadata.questionIndex === 'number'
                ? questions[metadata.questionIndex] || null
                : null;
            const nextQuestion = typeof metadata.questionIndex === 'number'
                ? questions[metadata.questionIndex + 1] || null
                : null;
            const startAfter = segmentQuestion && answerEl.contains(segmentQuestion)
                ? segmentQuestion
                : null;
            const endBefore = nextQuestion && answerEl.contains(nextQuestion)
                ? nextQuestion
                : null;

            // 重新查找该回答下的所有标题
            const headingsConfig = this.config.selectors.HEADINGS || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
            const allHeadings = [];
            
            const { features } = this.config;
            headingsConfig.forEach((selector, index) => {
                const headings = answerEl.querySelectorAll(selector);
                headings.forEach(heading => {
                    if (features && features.removeThinking) {
                        const thinkingEls = window.SELECTOR_MANAGER.getElements(this.platformId, 'thinking', answerEl);
                        if (thinkingEls.some(t => t.contains(heading))) return;
                    }
                    if (heading.classList.contains('sr-only')) return;
                    if (!heading.textContent.trim()) return;
                    if (startAfter && window.compareElementsByPosition(heading, startAfter) <= 0) return;
                    if (endBefore && window.compareElementsByPosition(heading, endBefore) >= 0) return;
                    allHeadings.push({ element: heading, level: index + 1 });
                });
            });

            // 智能提取兜底
            if (allHeadings.length === 0) {
                const smartHeadings = window.SELECTOR_MANAGER.getElements(this.platformId, 'HEADINGS', answerEl);
                smartHeadings.forEach(heading => {
                    if (startAfter && window.compareElementsByPosition(heading, startAfter) <= 0) return;
                    if (endBefore && window.compareElementsByPosition(heading, endBefore) >= 0) return;
                    allHeadings.push({ element: heading, level: 2 });
                });
            }

            const sortedHeadings = sortElementsByDocumentPosition(allHeadings);
            const keyedHeading = this._findByMetadata(
                sortedHeadings.map(item => item.element),
                metadata,
                'heading'
            );
            if (keyedHeading) return keyedHeading;
            const target = sortedHeadings[metadata.headingIndex];
            return target ? target.element : null;
        }
        return null;
    }

    _findByMetadata(elements, metadata, type) {
        return elements.find(element => {
            if (!element.textContent.trim()) return false;
            const key = this._elementKey(element, type);
            if (metadata.key && key === metadata.key) return true;
            return metadata.textKey && this._textKey(element) === metadata.textKey;
        }) || null;
    }
};
