(function() {
    window.CHAT_NAVIGATOR_CONTENT_VERSION = '2026-06-02-heading-level-normalization';

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
    let removeScrollRefreshListeners = null;
    let routeWatcher = null;

    // 提取大纲并发送
    window.extractAndSendOutline = function() {
        const result = pipeline.extract();
        cleanupStaleOutlineIds(result.outline);
        chrome.runtime.sendMessage({
            type: 'outline',
            outline: result.outline,
            diagnostics: result.diagnostics
        });
        
        // 初始化阅读位置检测
        setTimeout(initializeReadingPositionDetection, 500);
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
        setTimeout(() => {
            element.style.backgroundColor = originalBg;
        }, 1500);
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
        const turnTarget = await findChatGptTurnTarget(message);
        if (turnTarget) return turnTarget;

        const centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const scrollParent = getScrollParent(centerElement) || getScrollParent(document.body);
        if (!scrollParent) return null;

        const step = Math.max(300, Math.floor((scrollParent.clientHeight || window.innerHeight) * 0.8));
        const directions = [-1, 1];
        const maxSteps = Math.min(50, Math.ceil((scrollParent.scrollHeight || step) / step) + 2);

        // ponytail: bounded scan for virtual lists; replace with platform message-id deep links if ChatGPT exposes one.
        for (const direction of directions) {
            for (let i = 0; i < maxSteps; i++) {
                scrollParent.scrollBy({ top: direction * step, behavior: 'auto' });
                await new Promise(resolve => setTimeout(resolve, 80));

                const element = findOutlineTarget(message);
                if (element) return element;
            }
        }

        return null;
    }

    async function findChatGptTurnTarget(message) {
        const turnNumber = message.metadata?.turnNumber;
        const promptNumber = message.metadata?.promptNumber || (
            Number.isFinite(turnNumber) && turnNumber % 2 === 1
                ? (turnNumber + 1) / 2
                : null
        );
        if (pipeline.platformId !== 'CHATGPT') return null;

        if (Number.isFinite(promptNumber)) {
            const promptButton = document.querySelector(`button[aria-label="Prompt ${promptNumber}"]`);
            if (promptButton) {
                promptButton.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                const element = findOutlineTarget(message);
                if (element) return element;

                const promptTurn = document.querySelector(`[data-testid="conversation-turn-${(promptNumber * 2) - 1}"]`);
                if (promptTurn && promptTurn.textContent.trim()) return promptTurn;
            }
        }

        if (!Number.isFinite(turnNumber)) return null;

        const turn = document.querySelector(`[data-testid="conversation-turn-${turnNumber}"]`);
        if (!turn) return null;

        turn.scrollIntoView({ behavior: 'auto', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));
        return findOutlineTarget(message);
    }

    // 添加消息监听
    chrome.runtime.onMessage.addListener(handleMessage);

    function initializeOutline() {
        setTimeout(extractAndSendOutline, 1000);
        
        // 监听DOM变化
        mainObserver = new MutationObserver(throttle(() => {
            extractAndSendOutline();
        }, 1000)); // 1秒节流

        mainObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        initializeScrollRefresh();
        initializeRouteWatcher();
    }

    function initializeRouteWatcher() {
        let lastUrl = window.location.href;
        routeWatcher = setInterval(() => {
            if (window.location.href === lastUrl) return;
            lastUrl = window.location.href;
            extractAndSendOutline();
        }, 700);
    }

    function initializeScrollRefresh() {
        const { features = {} } = pipeline.config || {};
        if (pipeline.platformId !== 'CHATGPT' && !features.preserveOutlineAcrossDomUpdates) return;

        const refreshOnScroll = throttle(() => {
            extractAndSendOutline();
        }, 700);
        const centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const scrollParent = getScrollParent(centerElement) || document.scrollingElement || document.documentElement;
        const targets = [...new Set([window, scrollParent].filter(Boolean))];

        targets.forEach(target => {
            target.addEventListener('scroll', refreshOnScroll, { passive: true });
        });

        removeScrollRefreshListeners = () => {
            targets.forEach(target => {
                target.removeEventListener('scroll', refreshOnScroll);
            });
        };
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

    // 启动
    if (document.readyState === 'complete') {
        initializeOutline();
    } else {
        window.addEventListener('load', initializeOutline);
    }

    // 注册清理函数
    window.chatNavigatorCleanup = function() {
        if (mainObserver) mainObserver.disconnect();
        if (readingPositionObserver) readingPositionObserver.disconnect();
        if (removeScrollRefreshListeners) removeScrollRefreshListeners();
        if (routeWatcher) clearInterval(routeWatcher);
        chrome.runtime.onMessage.removeListener(handleMessage);
        window.removeEventListener('load', initializeOutline);
    };

})();
