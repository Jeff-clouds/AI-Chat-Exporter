(function() {
    window.CHAT_NAVIGATOR_CONTENT_VERSION = '2026-07-14-panel-lifecycle';

    // 清理旧的实例和监听器
    if (window.chatNavigatorCleanup) {
        try {
            window.chatNavigatorCleanup();
        } catch (err) {
            console.warn('AI Chat Export Pro: Ignored stale cleanup error', err);
        }
    }

    // 初始化管道
    const pipeline = new Pipeline();

    // 状态变量
    let readingPositionObserver = null;
    let currentReadingElement = null;
    let mainObserver = null;
    let routeWatcher = null;
    let initialRefreshTimer = null;
    let outlineRefreshTimer = null;
    let readingDetectionTimer = null;
    let observerRetryTimer = null;
    let started = false;
    const activePanelPorts = new Set();
    const highlightTimers = new Set();
    let lastOutlineJson = '';
    const refreshOutlineFromIndex = () => scheduleOutlineRefresh(350);

    function scheduleOutlineRefresh(delay = 1200) {
        if (!started) return;
        if (outlineRefreshTimer) clearTimeout(outlineRefreshTimer);
        outlineRefreshTimer = setTimeout(() => {
            outlineRefreshTimer = null;
            extractAndSendOutline();
        }, delay);
    }

    // 提取大纲并发送
    window.extractAndSendOutline = async function() {
        if (!started) return;
        const result = await pipeline.extractWithIndex();
        if (!started) return;

        // 避免重复发送相同的大纲（减少侧边栏无意义的刷新）
        const outlineJson = JSON.stringify(result.outline.map(i => i.id || i.text));
        if (outlineJson === lastOutlineJson && result.outline.length > 0) {
            return;
        }
        lastOutlineJson = outlineJson;

        cleanupStaleOutlineIds(result.outline);
        chrome.runtime.sendMessage({
            type: 'outline',
            outline: result.outline,
            diagnostics: result.diagnostics
        });
        
        // 初始化阅读位置检测
        if (readingDetectionTimer) clearTimeout(readingDetectionTimer);
        readingDetectionTimer = setTimeout(() => {
            readingDetectionTimer = null;
            initializeReadingPositionDetection();
        }, 500);
    }

    function cleanupStaleOutlineIds(outline) {
        const activeIds = new Set(outline.map(item => item.id).filter(Boolean));
        document.querySelectorAll('[id^="cn-"]').forEach(element => {
            if (!activeIds.has(element.id) || !element.textContent.trim()) {
                element.removeAttribute('id');
            }
        });
    }

    function initializeReadingPositionDetection() {
        if (readingPositionObserver) readingPositionObserver.disconnect();
        
        const outlineElements = Array.from(document.querySelectorAll('[id^="cn-"]'))
            .filter(element => element.textContent.trim());
        if (outlineElements.length === 0) return;
        
        readingPositionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateCurrentReadingPosition(entry.target);
                }
            });
        }, {
            threshold: 0.3,
            rootMargin: '-20% 0px -20% 0px'
        });
        
        outlineElements.forEach(element => readingPositionObserver.observe(element));
    }

    function updateCurrentReadingPosition(element) {
        if (currentReadingElement === element) return;
        currentReadingElement = element;
        chrome.runtime.sendMessage({
            type: 'updateReadingPosition',
            elementId: element.id,
            elementText: element.textContent.trim()
        });
    }

    // 查找滚动父容器
    function getScrollParent(element) {
        if (!element) return null;
        
        // 优先查找 Kimi 的特定滚动容器
        const kimiScrollContainer = element.closest('.chat-detail-main');
        if (kimiScrollContainer) {
            return kimiScrollContainer;
        }

        let parent = element.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';
            
            if (isScrollable && parent.scrollHeight > parent.clientHeight) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    // 自定义滚动逻辑
    function smoothScrollToElement(element) {
        const scrollParent = getScrollParent(element);
        
        if (scrollParent && scrollParent !== document.documentElement && scrollParent !== document.body) {
            // 计算相对位置
            const elementRect = element.getBoundingClientRect();
            const parentRect = scrollParent.getBoundingClientRect();
            
            // 目标位置 = 当前滚动位置 + 元素相对于视口的 top - 容器相对于视口的 top - 容器高度的一半 + 元素高度的一半
            // 简化为：使元素居中
            const offsetTop = elementRect.top - parentRect.top;
            const targetScrollTop = scrollParent.scrollTop + offsetTop - (scrollParent.clientHeight / 2) + (element.clientHeight / 2);
            
            scrollParent.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
        } else {
            // 回退到默认行为
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // 消息处理函数
    function handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'scrollTo':
                scrollToOutlineTarget(message);
                break;
            case 'getOutline':
                extractAndSendOutline();
                break;
            case 'toggle_outline':
                // 仅作日志，实际功能由 SidePanel 处理
                console.log('toggle_outline command received');
                break;
            case 'next_heading':
                navigateHeadings('next');
                break;
            case 'prev_heading':
                navigateHeadings('prev');
                break;
        }
    }

    async function scrollToOutlineTarget(message) {
        let element = findOutlineTarget(message);
        if (!element && message.metadata) {
            element = await findVirtualizedTarget(message);
        }

        if (!element) return;

        if (message.elementId) element.id = message.elementId;
        smoothScrollToElement(element);
        
        // 暂时高亮
        element.style.transition = 'background-color 0.5s';
        const originalBg = element.style.backgroundColor;
        element.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
        const highlightTimer = setTimeout(() => {
            element.style.backgroundColor = originalBg;
            highlightTimers.delete(highlightTimer);
        }, 1500);
        highlightTimers.add(highlightTimer);
    }

    function findOutlineTarget(message) {
        let element = document.getElementById(message.elementId);
        if (element && !element.textContent.trim()) element = null;
        if (!element && message.metadata) {
            element = pipeline.findElement(message.metadata);
        }
        return element;
    }

    async function findVirtualizedTarget(message) {
        const indexedTarget = await findIndexedMessageTarget(message.metadata);
        if (indexedTarget) return indexedTarget;

        const turnTarget = await findChatGptTurnTarget(message);
        if (turnTarget) return turnTarget;
        return null;
    }

    async function findIndexedMessageTarget(metadata) {
        if (!metadata?.messageId && !metadata?.turnId) return null;
        const escape = value => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        const selector = metadata.messageId
            ? `[data-message-id="${escape(metadata.messageId)}"]`
            : `[data-turn-id="${escape(metadata.turnId)}"]`;
        let element = document.querySelector(selector);
        if (element) return element;

        const centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const scrollParent = getScrollParent(centerElement) || document.scrollingElement;
        if (!scrollParent) return null;
        if (Number.isFinite(metadata.offset)) {
            scrollParent.scrollTo({ top: metadata.offset, behavior: 'auto' });
            await new Promise(resolve => setTimeout(resolve, 180));
            element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    async function findChatGptTurnTarget(message) {
        const turnNumber = message.metadata?.turnNumber;
        if (pipeline.platformId !== 'CHATGPT') return null;

        if (!Number.isFinite(turnNumber)) return null;

        const turn = document.querySelector(`[data-testid="conversation-turn-${turnNumber}"]`);
        if (!turn) return null;

        // 交给调用方做唯一一次居中滚动，避免“先虚拟跳转、再平滑居中”的双重滚动。
        return turn;
    }

    // 添加消息监听；只有侧栏端口存在时才启动持续分析。
    chrome.runtime.onMessage.addListener(handleMessage);

    function handlePanelConnect(port) {
        if (port.name !== 'ai-chat-exporter-panel') return;
        activePanelPorts.add(port);
        initializeOutline();
        port.onDisconnect.addListener(() => {
            activePanelPorts.delete(port);
            if (activePanelPorts.size === 0) window.chatNavigatorCleanup();
        });
    }

    chrome.runtime.onConnect.addListener(handlePanelConnect);

    function findObservationRoot() {
        if (pipeline.platformId === 'DOUBAO') {
            return window.AI_CHAT_CONVERSATION_INDEX?.findDoubaoScroller?.() || null;
        }
        return document.querySelector(
            'main, [role="main"], [data-testid="conversation-turn-1"]' +
            ', .chat-detail-main, [class*="conversation"], [class*="chat-content"]'
        );
    }

    function observeConversationRoot() {
        if (!started || mainObserver) return;
        // ChatGPT 侧栏只做打开时的轻量 DOM 快照；完整 API 仅由明确导出触发。
        // 豆包虚拟列表由 ConversationIndex 自己做按消息 ID 的增量观察，避免双 observer。
        if (pipeline.platformId === 'CHATGPT' || pipeline.platformId === 'DOUBAO') return;
        const root = findObservationRoot();
        if (!root) {
            observerRetryTimer = setTimeout(() => {
                observerRetryTimer = null;
                observeConversationRoot();
            }, 1500);
            return;
        }

        mainObserver = new MutationObserver(() => scheduleOutlineRefresh(1400));
        mainObserver.observe(root, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function initializeOutline() {
        if (started) return;
        started = true;
        window.__AI_CHAT_EXPORTER_PANEL_ACTIVE__ = true;
        initialRefreshTimer = setTimeout(() => {
            initialRefreshTimer = null;
            extractAndSendOutline();
        }, 250);

        // 只观察会话容器；流式输出合并为停止变化约 1.4 秒后的一次刷新。
        observeConversationRoot();

        // 豆包虚拟列表在用户滚动后可能复用节点而不新增子节点；只做静默目录刷新。
        window.addEventListener('ai-chat-index-updated', refreshOutlineFromIndex);

        initializeRouteWatcher();
    }

    function initializeRouteWatcher() {
        let lastUrl = window.location.href;
        routeWatcher = setInterval(() => {
            if (window.location.href === lastUrl) return;
            lastUrl = window.location.href;
            extractAndSendOutline();
        }, 1500);
    }



    // 导航功能实现
    function navigateHeadings(direction) {
        const outlineElements = Array.from(document.querySelectorAll('[id^="cn-"]'));
        if (outlineElements.length === 0) return;

        // 找到当前视口中最接近顶部的元素
        let currentIndex = -1;
        
        // 如果有当前阅读位置记录
        if (currentReadingElement) {
            currentIndex = outlineElements.indexOf(currentReadingElement);
        } else {
            // 否则查找视口中的第一个
            const viewportHeight = window.innerHeight;
            for (let i = 0; i < outlineElements.length; i++) {
                const rect = outlineElements[i].getBoundingClientRect();
                if (rect.top >= 0 && rect.top < viewportHeight) {
                    currentIndex = i;
                    break;
                }
            }
        }

        let nextIndex;
        if (direction === 'next') {
            nextIndex = currentIndex + 1;
            if (nextIndex >= outlineElements.length) nextIndex = 0; // 循环
        } else {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) nextIndex = outlineElements.length - 1; // 循环
        }

        const targetElement = outlineElements[nextIndex];
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            updateCurrentReadingPosition(targetElement);
        }
    }

    // 注册清理函数
    window.chatNavigatorCleanup = function() {
        started = false;
        window.__AI_CHAT_EXPORTER_PANEL_ACTIVE__ = false;
        if (mainObserver) mainObserver.disconnect();
        mainObserver = null;
        if (readingPositionObserver) readingPositionObserver.disconnect();
        readingPositionObserver = null;
        if (routeWatcher) clearInterval(routeWatcher);
        routeWatcher = null;
        if (initialRefreshTimer) clearTimeout(initialRefreshTimer);
        initialRefreshTimer = null;
        if (outlineRefreshTimer) clearTimeout(outlineRefreshTimer);
        outlineRefreshTimer = null;
        if (readingDetectionTimer) clearTimeout(readingDetectionTimer);
        readingDetectionTimer = null;
        if (observerRetryTimer) clearTimeout(observerRetryTimer);
        observerRetryTimer = null;
        highlightTimers.forEach(timer => clearTimeout(timer));
        highlightTimers.clear();
        window.AI_CHAT_CONVERSATION_INDEX?.disconnect?.();
        window.removeEventListener('ai-chat-index-updated', refreshOutlineFromIndex);
        chrome.runtime.onMessage.removeListener(handleMessage);
        chrome.runtime.onConnect.removeListener(handlePanelConnect);
        activePanelPorts.forEach(port => {
            try { port.disconnect(); } catch (_) {}
        });
        activePanelPorts.clear();
    };

})();
