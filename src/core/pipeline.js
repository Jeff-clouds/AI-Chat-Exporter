window.Pipeline = class Pipeline {
    static version = '2026-06-02-heading-level-normalization';

    constructor() {
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
                    this._fillStats(outline, diagnostics);
                    return { outline, diagnostics };
                }
            }

            // 2. 回退到扁平模式 (Flat Mode)
            diagnostics.strategy = 'flat';
            this._extractFlat(outline);
            this._fillStats(outline, diagnostics);
            
            return { outline, diagnostics };
        } catch (err) {
            console.error('AI Chat Export Pro: Extraction error', err);
            diagnostics.error = err.message;
            return { outline: [], diagnostics };
        }
    }

    _fillStats(outline, diagnostics) {
        outline.forEach(item => {
            if (item.type === 'question') diagnostics.stats.questions++;
            else if (item.type === 'answer') diagnostics.stats.headings++;
        });
        // 注意：这里的 answers 数量在扁平模式下不直接等于 outline 项数
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
        );
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
        const stableId = `cn-q-${index}`;
        if (questionEl.id !== stableId) questionEl.id = stableId;
        
        let text = questionEl.textContent.trim();
        if (text.length > 50) text = text.substring(0, 50) + '...';
        
        outline.push({
            text: `问题 ${index + 1}: ${text}`,
            level: 'h1',
            id: questionEl.id,
            type: 'question',
            metadata: {
                type: 'question',
                index: index
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
            const stableId = `cn-a-${answerIndex}-${segmentKey}-h-${headingIndex}`;
            if (element.id !== stableId) element.id = stableId;
            
            outline.push({
                text: element.textContent.trim(),
                level: `h${normalizedLevel}`,
                id: element.id,
                type: 'answer',
                metadata: {
                    type: 'answer',
                    answerIndex: answerIndex,
                    headingIndex: headingIndex,
                    questionIndex: questionIndex,
                    segmented: !!startAfter || !!endBefore
                }
            });
        });
    }

    // 根据元数据查找元素
    findElement(metadata) {
        if (!this.config || !metadata) return null;

        if (metadata.type === 'question') {
            const questions = this._sortElements(
                window.SELECTOR_MANAGER.getElements(this.platformId, 'question')
            );
            return questions[metadata.index] || null;
        } else if (metadata.type === 'answer') {
            const answers = this._sortElements(
                window.SELECTOR_MANAGER.getElements(this.platformId, 'answer')
            );
            const answerEl = answers[metadata.answerIndex];
            if (!answerEl) return null;

            const questions = this._sortElements(
                window.SELECTOR_MANAGER.getElements(this.platformId, 'question')
            );
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
            const target = sortedHeadings[metadata.headingIndex];
            return target ? target.element : null;
        }
        return null;
    }
};
