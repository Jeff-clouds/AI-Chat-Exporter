(function() {
    const CONTENT_VERSION = '2026-09-13-chatgpt-repair';
    // The side panel re-injects its file list whenever the active ChatGPT route changes.
    // Re-running the same content runtime used to tear down the live conversation index,
    // release both caches, and then rebuild an empty index during A→B→A navigation.
    // Keep the already-running, same-version lifecycle authoritative until its panel port
    // is actually disconnected.
    if (window.CHAT_NAVIGATOR_CONTENT_VERSION === CONTENT_VERSION
        && typeof window.extractAndSendOutline === 'function') return;
    window.CHAT_NAVIGATOR_CONTENT_VERSION = CONTENT_VERSION;

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
    let routeChangeHandler = null;
    let restoreRouteHooks = null;
    let initialRefreshTimer = null;
    let outlineRefreshTimer = null;
    let readingDetectionTimer = null;
    let observerRetryTimer = null;
    let outlineExtraction = null;
    let outlineRefreshPending = false;
    let activeOutlineRequestToken = '';
    let activeOutlineRequestUrl = '';
    let started = false;
    const activePanelPorts = new Set();
    const highlightTimers = new Set();
    const pendingJumpCleanups = new Set();
    const CHATGPT_JUMP_TIMEOUT_MS = Number(window.__AI_CHAT_EXPORT_TESTS__?.jumpTimeoutMs) || 2500;
    const CHATGPT_REPAIR_MAX_STEPS = 8;
    const CHATGPT_REPAIR_TIMEOUT_MS = 10000;
    const CHATGPT_REPAIR_REINDEX_TIMEOUT_MS = 4000;
    // The bounded virtual-scroll phase remains off in production until it passes
    // real long-conversation acceptance. Tests can exercise it explicitly.
    const CHATGPT_REPAIR_SCROLL_ENABLED = window.__AI_CHAT_EXPORT_TESTS__?.enableRepairScroll === true;
    let activeJumpGeneration = 0;
    let activeRepair = null;
    let lastOutlineJson = '';
    const refreshOutlineFromIndex = () => scheduleOutlineRefresh(350);

    function scheduleOutlineRefresh(delay = 1200) {
        if (!started) return;
        if (outlineExtraction) {
            outlineRefreshPending = true;
            return;
        }
        if (outlineRefreshTimer) clearTimeout(outlineRefreshTimer);
        outlineRefreshTimer = setTimeout(() => {
            outlineRefreshTimer = null;
            extractAndSendOutline();
        }, delay);
    }

    // 提取大纲并发送
    window.extractAndSendOutline = function() {
        if (!started) return Promise.resolve();
        if (outlineExtraction) {
            outlineRefreshPending = true;
            return outlineExtraction;
        }
        outlineRefreshPending = false;
        outlineExtraction = (async () => {
            const extractionUrl = window.location.href;
            const extractionRequestToken = activeOutlineRequestToken;
            const extractionRequestUrl = activeOutlineRequestUrl;
            const result = await pipeline.extractWithIndex();
            // A ChatGPT SPA transition can happen while a previous extraction is running.
            // Never let that older result repaint the newly selected conversation.
            if (!started || window.location.href !== extractionUrl) return;
            if (!extractionRequestToken || extractionRequestToken !== activeOutlineRequestToken) return;
            if (extractionRequestUrl && extractionRequestUrl !== extractionUrl) return;

            // 避免重复发送相同的大纲（减少侧边栏无意义的刷新）
            const outlineJson = JSON.stringify(result.outline.map(i => [i.id || '', i.text, i.level, i.type]));
            if (outlineJson === lastOutlineJson && result.outline.length > 0) {
                return;
            }
            lastOutlineJson = outlineJson;

            cleanupStaleOutlineIds(result.outline);
            chrome.runtime.sendMessage({
                type: 'outline',
                outline: result.outline,
                diagnostics: result.diagnostics,
                requestToken: extractionRequestToken
            });

            // 初始化阅读位置检测
            if (readingDetectionTimer) clearTimeout(readingDetectionTimer);
            readingDetectionTimer = setTimeout(() => {
                readingDetectionTimer = null;
                initializeReadingPositionDetection();
            }, 500);
        })().finally(() => {
            outlineExtraction = null;
            if (started && outlineRefreshPending) {
                outlineRefreshPending = false;
                scheduleOutlineRefresh(60);
            }
        });
        return outlineExtraction;
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
                cancelActiveRepair('superseded');
                scrollToOutlineTarget(message)
                    .then(sendResponse)
                    .catch(error => sendResponse({ success: false, reason: error?.message || 'jump-failed' }));
                return true;
            case 'repairAndLocate':
                repairAndLocate(message)
                    .then(sendResponse)
                    .catch(error => sendResponse({ success: false, reason: error?.message || 'repair-failed' }));
                return true;
            case 'cancelRepair':
                if (cancelActiveRepair('cancelled', message.operationId)) {
                    sendResponse({ success: true, reason: 'cancelled' });
                } else {
                    sendResponse({ success: false, reason: 'repair-not-active' });
                }
                return true;
            case 'getOutline':
                if (!message.requestToken || (message.url && message.url !== window.location.href)) return;
                activeOutlineRequestToken = message.requestToken;
                activeOutlineRequestUrl = message.url || window.location.href;
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
        const expectedUrl = window.location.href;
        if (pipeline.platformId === 'CHATGPT' && (!message.url || !message.requestToken)) {
            return { success: false, reason: 'missing-request-identity' };
        }
        if (pipeline.platformId === 'CHATGPT' && (
            !Number.isFinite(message.metadata?.turnNumber)
            || (!message.metadata?.messageId && !message.metadata?.turnId)
        )) {
            return { success: false, reason: 'missing-target-identity' };
        }
        if (message.url && message.url !== expectedUrl) {
            return { success: false, reason: 'route-mismatch' };
        }
        if (message.requestToken && message.requestToken !== activeOutlineRequestToken) {
            return { success: false, reason: 'request-mismatch' };
        }

        cancelPendingJumps();
        const jumpGeneration = ++activeJumpGeneration;
        let element = findOutlineTarget(message);
        if (!element && message.metadata) {
            element = await findVirtualizedTarget(message, expectedUrl, jumpGeneration);
        }

        if (!element || window.location.href !== expectedUrl || jumpGeneration !== activeJumpGeneration) {
            return { success: false, reason: window.location.href === expectedUrl ? 'target-not-mounted' : 'route-changed' };
        }

        if (message.elementId) element.id = message.elementId;
        smoothScrollToElement(element);
        // A successful click already resolved and identity-checked the exact outline target.
        // Publish that authoritative target immediately instead of waiting for an
        // IntersectionObserver callback that may still reflect the pre-jump viewport.
        updateCurrentReadingPosition(element);
        
        // 暂时高亮
        element.style.transition = 'background-color 0.5s';
        const originalBg = element.style.backgroundColor;
        element.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
        const highlightTimer = setTimeout(() => {
            element.style.backgroundColor = originalBg;
            highlightTimers.delete(highlightTimer);
        }, 1500);
        highlightTimers.add(highlightTimer);
        return { success: true, reason: 'located' };
    }

    function findOutlineTarget(message) {
        let element = document.getElementById(message.elementId);
        if (element && !element.textContent.trim()) element = null;
        if (element && !targetMatchesIdentity(element, message.metadata)) element = null;
        if (!element && message.metadata) {
            element = pipeline.findElement(message.metadata);
            if (element && !targetMatchesIdentity(element, message.metadata)) element = null;
        }
        return element;
    }

    async function findVirtualizedTarget(message, expectedUrl, jumpGeneration) {
        const metadata = message.metadata || {};
        if (pipeline.platformId === 'CHATGPT' && (!Number.isFinite(metadata.turnNumber) || (!metadata.messageId && !metadata.turnId))) {
            return null;
        }

        let indexedTarget = findMountedIdentityTarget(metadata);
        // ChatGPT API records have no authoritative DOM offset. Never let an old
        // or synthetic offset create an extra page movement before identity checks.
        if (!indexedTarget && pipeline.platformId !== 'CHATGPT') {
            indexedTarget = await findIndexedMessageTarget(metadata, expectedUrl, jumpGeneration);
        }
        if (window.location.href !== expectedUrl || jumpGeneration !== activeJumpGeneration) return null;
        if (indexedTarget && metadata.type !== 'answer') return indexedTarget;

        const turnTarget = await findChatGptTurnTarget(message);
        if (turnTarget && metadata.type !== 'answer') return turnTarget;
        if (pipeline.platformId !== 'CHATGPT' || !Number.isFinite(metadata.turnNumber)) return null;

        // A user-initiated jump may move the page once to a nearby mounted turn.
        // This is navigation, not a background completeness scan: no loop and no
        // repeated scrolling are allowed if the exact message fails to mount.
        const anchor = findNearestMountedChatGptTurn(
            metadata.turnNumber,
            metadata.type === 'answer' && Boolean(indexedTarget)
        );
        if (!anchor) return null;
        anchor.element.scrollIntoView({
            behavior: 'auto',
            block: anchor.turnNumber >= metadata.turnNumber ? 'start' : 'end'
        });
        return waitForExactOutlineTarget(message, expectedUrl, jumpGeneration);
    }

    function identitySelector(metadata) {
        const value = metadata?.messageId || metadata?.turnId;
        if (!value) return '';
        const attr = metadata.messageId ? 'data-message-id' : 'data-turn-id';
        const escaped = window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        return `[${attr}="${escaped}"]`;
    }

    function findMountedIdentityTarget(metadata) {
        const selector = identitySelector(metadata);
        return selector ? document.querySelector(selector) : null;
    }

    function targetMatchesIdentity(element, metadata) {
        const selector = identitySelector(metadata);
        if (!selector) return true;
        if (metadata?.type === 'answer' && !element.matches?.('h1,h2,h3,h4,h5,h6')) return false;
        return Boolean(
            element.matches?.(selector)
            || element.closest?.(selector)
            || element.querySelector?.(selector)
        );
    }

    async function findIndexedMessageTarget(metadata, expectedUrl = window.location.href, jumpGeneration = activeJumpGeneration) {
        if (!metadata?.messageId && !metadata?.turnId) return null;
        const selector = identitySelector(metadata);
        let element = findMountedIdentityTarget(metadata);
        if (element) return element;
        if (window.location.href !== expectedUrl || jumpGeneration !== activeJumpGeneration) return null;

        const centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const scrollParent = getScrollParent(centerElement) || document.scrollingElement;
        if (!scrollParent) return null;
        if (Number.isFinite(metadata.offset)) {
            scrollParent.scrollTo({ top: metadata.offset, behavior: 'auto' });
            await new Promise(resolve => setTimeout(resolve, 180));
            if (window.location.href !== expectedUrl || jumpGeneration !== activeJumpGeneration) return null;
            element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    function findChatGptTurnTarget(message) {
        const turnNumber = message.metadata?.turnNumber;
        if (pipeline.platformId !== 'CHATGPT') return null;

        if (!Number.isFinite(turnNumber)) return null;

        const turn = document.querySelector(`[data-testid="conversation-turn-${turnNumber}"]`);
        if (!turn) return null;
        const selector = identitySelector(message.metadata);
        if (selector && !turn.matches?.(selector) && !turn.querySelector?.(selector)) return null;

        // 交给调用方做唯一一次居中滚动，避免“先虚拟跳转、再平滑居中”的双重滚动。
        return turn;
    }

    function findNearestMountedChatGptTurn(targetTurnNumber, allowExact = false) {
        const turns = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'))
            .map(element => {
                const match = element.getAttribute('data-testid')?.match(/^conversation-turn-(\d+)$/);
                return match ? { element, turnNumber: Number(match[1]) } : null;
            })
            .filter(item => item && (allowExact || item.turnNumber !== targetTurnNumber));
        return turns.reduce((nearest, item) => {
            if (!nearest) return item;
            return Math.abs(item.turnNumber - targetTurnNumber) < Math.abs(nearest.turnNumber - targetTurnNumber)
                ? item
                : nearest;
        }, null);
    }

    function waitForExactOutlineTarget(message, expectedUrl, jumpGeneration) {
        return new Promise(resolve => {
            let settled = false;
            // The host may replace <main> during a React transition. This observer
            // is body-scoped but exists only for one bounded, user-triggered jump.
            const root = document.body;
            const exactTarget = () => {
                if (window.location.href !== expectedUrl || jumpGeneration !== activeJumpGeneration) return null;
                const outlineTarget = findOutlineTarget(message);
                if (outlineTarget) return outlineTarget;
                if (message.metadata?.type === 'answer') return null;
                return findMountedIdentityTarget(message.metadata)
                    || findChatGptTurnTarget(message);
            };
            const finish = target => {
                if (settled) return;
                settled = true;
                observer.disconnect();
                clearTimeout(timer);
                pendingJumpCleanups.delete(cancel);
                resolve(target || null);
            };
            const cancel = () => finish(null);
            const check = () => {
                if (window.location.href !== expectedUrl || jumpGeneration !== activeJumpGeneration) return finish(null);
                const target = exactTarget();
                if (target) finish(target);
            };
            const observer = new MutationObserver(check);
            const timer = setTimeout(() => finish(null), CHATGPT_JUMP_TIMEOUT_MS);
            pendingJumpCleanups.add(cancel);
            observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-testid', 'data-message-id', 'data-turn-id']
            });
            check();
        });
    }

    function cancelPendingJumps() {
        Array.from(pendingJumpCleanups).forEach(cancel => cancel());
        pendingJumpCleanups.clear();
    }

    function repairRequestIsCurrent(message) {
        return pipeline.platformId === 'CHATGPT'
            && Boolean(message?.operationId)
            && Boolean(message?.url)
            && Boolean(message?.requestToken)
            && message.url === window.location.href
            && message.requestToken === activeOutlineRequestToken
            && message.metadata?.messageId
            && Number.isFinite(message.metadata?.turnNumber);
    }

    function reportRepair(operation, phase, detail = {}) {
        if (activeRepair !== operation || operation.cancelled) return;
        chrome.runtime.sendMessage({
            type: 'repairProgress',
            operationId: operation.id,
            requestToken: operation.requestToken,
            url: operation.url,
            phase,
            ...detail
        });
    }

    function cancelActiveRepair(reason = 'cancelled', operationId = '') {
        const operation = activeRepair;
        if (!operation || (operationId && operation.id !== operationId)) return false;
        operation.cancelled = true;
        operation.cancelReason = reason;
        operation.waitCleanups.forEach(cleanup => cleanup());
        operation.waitCleanups.clear();
        return true;
    }

    function repairIsActive(operation) {
        return activeRepair === operation
            && !operation.cancelled
            && window.location.href === operation.url
            && activeOutlineRequestToken === operation.requestToken
            && Date.now() <= operation.deadline;
    }

    function findRepairOutlineCandidates(outline, metadata) {
        const candidates = outline.filter(item => item?.type === metadata?.type
            && item.metadata?.messageId === metadata?.messageId);
        if (metadata?.type !== 'answer') return candidates;
        return candidates.filter(item => item.metadata?.textKey === metadata.textKey
            && item.metadata?.headingOccurrence === metadata.headingOccurrence);
    }

    function sendRepairOutline(result, operation) {
        if (!repairIsActive(operation)) return;
        cleanupStaleOutlineIds(result.outline);
        lastOutlineJson = JSON.stringify(result.outline.map(item => [item.id || '', item.text, item.level, item.type]));
        chrome.runtime.sendMessage({
            type: 'outline',
            outline: result.outline,
            diagnostics: result.diagnostics,
            requestToken: operation.requestToken
        });
    }

    function withTimeout(promise, timeoutMs) {
        let timer = null;
        return Promise.race([
            promise,
            new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })
        ]).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }

    function captureRepairPosition() {
        const focus = document.elementFromPoint?.(window.innerWidth / 2, window.innerHeight / 2);
        const scrollParent = getScrollParent(focus) || document.scrollingElement || document.documentElement;
        const anchor = focus?.closest?.('[data-message-id], [data-turn-id]') || null;
        const anchorId = anchor?.getAttribute?.('data-message-id') || anchor?.getAttribute?.('data-turn-id') || '';
        const anchorAttribute = anchor?.getAttribute?.('data-message-id') ? 'data-message-id'
            : (anchor?.getAttribute?.('data-turn-id') ? 'data-turn-id' : '');
        return {
            scrollParent,
            scrollTop: Number.isFinite(scrollParent?.scrollTop) ? scrollParent.scrollTop : 0,
            anchorId,
            anchorAttribute,
            anchorTop: anchor?.getBoundingClientRect?.().top || 0
        };
    }

    function restoreRepairPosition(position) {
        if (!position?.scrollParent) return false;
        let restoredByAnchor = false;
        if (position.anchorId && position.anchorAttribute) {
            const escaped = window.CSS?.escape
                ? CSS.escape(position.anchorId)
                : String(position.anchorId).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
            const anchor = document.querySelector(`[${position.anchorAttribute}="${escaped}"]`);
            if (anchor) {
                anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
                const adjustment = (anchor.getBoundingClientRect?.().top || 0) - position.anchorTop;
                position.scrollParent.scrollTo?.({ top: Math.max(0, position.scrollParent.scrollTop + adjustment), behavior: 'auto' });
                restoredByAnchor = true;
            }
        }
        if (!restoredByAnchor) position.scrollParent.scrollTo?.({ top: position.scrollTop, behavior: 'auto' });
        return true;
    }

    function mountedTurnSignature() {
        return Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'))
            .map(turn => `${turn.getAttribute?.('data-testid') || ''}:${turn.getAttribute?.('data-message-id') || ''}:${turn.querySelector?.('[data-message-id]')?.getAttribute?.('data-message-id') || ''}`)
            .join('|');
    }

    function waitForRepairMount(operation, previousSignature) {
        return new Promise(resolve => {
            let settled = false;
            const finish = changed => {
                if (settled) return;
                settled = true;
                observer.disconnect();
                clearTimeout(timer);
                operation.waitCleanups.delete(cancel);
                resolve(changed);
            };
            const cancel = () => finish(false);
            const check = () => {
                if (!repairIsActive(operation)) return finish(false);
                if (mountedTurnSignature() !== previousSignature) finish(true);
            };
            const observer = new MutationObserver(check);
            const timer = setTimeout(() => finish(false), Math.min(900, Math.max(0, operation.deadline - Date.now())));
            operation.waitCleanups.add(cancel);
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-testid', 'data-message-id', 'data-turn-id'] });
            check();
        });
    }

    function selectRepairAnchor(targetTurnNumber) {
        const turns = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'))
            .map(element => {
                const match = element.getAttribute?.('data-testid')?.match(/^conversation-turn-(\d+)$/);
                return match ? { element, turnNumber: Number(match[1]) } : null;
            })
            .filter(Boolean)
            .sort((left, right) => left.turnNumber - right.turnNumber);
        if (turns.length === 0) return null;
        const lower = turns.filter(turn => turn.turnNumber < targetTurnNumber).at(-1);
        const upper = turns.find(turn => turn.turnNumber > targetTurnNumber);
        if (lower) return { ...lower, block: 'end' };
        if (upper) return { ...upper, block: 'start' };
        return null;
    }

    function clickNativePromptAnchor(metadata) {
        const promptNumber = metadata.type === 'question'
            ? (metadata.turnNumber + 1) / 2
            : metadata.turnNumber / 2;
        if (!Number.isInteger(promptNumber) || promptNumber < 1) return false;
        const button = Array.from(document.querySelectorAll('button[aria-label^="Prompt "]'))
            .find(candidate => candidate.getAttribute('aria-label') === `Prompt ${promptNumber}`);
        if (!button || typeof button.click !== 'function') return false;
        button.click();
        return true;
    }

    async function locateWithBoundedRepair(operation, message) {
        if (!CHATGPT_REPAIR_SCROLL_ENABLED && !findOutlineTarget(message)) {
            return { success: false, reason: 'target-not-mounted', scrollAssistAvailable: false };
        }
        let noProgressSteps = 0;
        let usedNativeAnchor = false;
        for (let step = 0; step < CHATGPT_REPAIR_MAX_STEPS; step++) {
            if (!repairIsActive(operation)) return { success: false, reason: operation.cancelReason || 'repair-timeout' };
            if (findOutlineTarget(message)) return scrollToOutlineTarget(message);
            const signature = mountedTurnSignature();
            let moved = false;
            if (!usedNativeAnchor) {
                usedNativeAnchor = clickNativePromptAnchor(message.metadata);
                moved = usedNativeAnchor;
            }
            if (!moved) {
                const targetTurn = document.querySelector(`[data-testid="conversation-turn-${message.metadata.turnNumber}"]`);
                if (targetTurn) return { success: false, reason: 'identity-conflict' };
                const anchor = selectRepairAnchor(message.metadata.turnNumber);
                if (!anchor) return { success: false, reason: 'target-not-mounted' };
                anchor.element.scrollIntoView({ behavior: 'auto', block: anchor.block });
            }
            operation.steps = step + 1;
            reportRepair(operation, 'searching', { steps: operation.steps, maxSteps: CHATGPT_REPAIR_MAX_STEPS });
            const changed = await waitForRepairMount(operation, signature);
            if (findOutlineTarget(message)) return scrollToOutlineTarget(message);
            noProgressSteps = changed ? 0 : noProgressSteps + 1;
            if (noProgressSteps >= 2) return { success: false, reason: 'no-progress' };
        }
        return { success: false, reason: Date.now() > operation.deadline ? 'repair-timeout' : 'target-not-mounted' };
    }

    async function repairAndLocate(message) {
        if (!repairRequestIsCurrent(message)) return { success: false, reason: 'invalid-repair-request' };
        cancelActiveRepair('superseded');
        cancelPendingJumps();
        const operation = {
            id: message.operationId,
            url: message.url,
            requestToken: message.requestToken,
            cancelled: false,
            cancelReason: '',
            deadline: Date.now() + CHATGPT_REPAIR_TIMEOUT_MS,
            steps: 0,
            waitCleanups: new Set(),
            position: captureRepairPosition()
        };
        activeRepair = operation;
        reportRepair(operation, 'reindexing');
        let result;
        try {
            result = await withTimeout(
                pipeline.extractWithIndex({ force: true, awaitApi: true }),
                CHATGPT_REPAIR_REINDEX_TIMEOUT_MS
            );
            if (!result) {
                result = await pipeline.extractWithIndex({ force: false, awaitApi: false });
            }
            if (!repairIsActive(operation)) return { success: false, reason: operation.cancelReason || 'repair-timeout', restored: restoreRepairPosition(operation.position) };
            sendRepairOutline(result, operation);
            const candidates = findRepairOutlineCandidates(result.outline, message.metadata);
            if (candidates.length !== 1) {
                const reason = candidates.length === 0 ? 'stale-outline' : 'identity-conflict';
                reportRepair(operation, 'failed', { reason, outlineReplaced: true });
                return { success: false, reason, outlineReplaced: true, restored: restoreRepairPosition(operation.position) };
            }
            const target = candidates[0];
            const repairMessage = { ...message, elementId: target.id, metadata: target.metadata };
            reportRepair(operation, 'locating', { outlineReplaced: true });
            const located = await locateWithBoundedRepair(operation, repairMessage);
            if (!located.success) {
                const reason = operation.cancelled ? operation.cancelReason || 'cancelled' : located.reason;
                const restored = restoreRepairPosition(operation.position);
                reportRepair(operation, reason === 'cancelled' ? 'cancelled' : 'failed', { reason, steps: operation.steps, restored });
                return {
                    success: false,
                    reason,
                    outlineReplaced: true,
                    steps: operation.steps,
                    restored,
                    scrollAssistAvailable: located.scrollAssistAvailable !== false
                };
            }
            reportRepair(operation, 'located', { steps: operation.steps, outlineReplaced: true });
            return { success: true, reason: 'located', outlineReplaced: true, steps: operation.steps, restored: false };
        } finally {
            operation.waitCleanups.forEach(cleanup => cleanup());
            operation.waitCleanups.clear();
            if (activeRepair === operation) activeRepair = null;
        }
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
        // ChatGPT / 豆包由 ConversationIndex 做会话容器级的有界增量观察，避免双 observer。
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

        // ChatGPT / 豆包虚拟列表在用户滚动后会复用节点；索引只在内容确实变化时发事件。
        window.addEventListener('ai-chat-index-updated', refreshOutlineFromIndex);

        initializeRouteWatcher();
    }

    function initializeRouteWatcher() {
        let lastUrl = window.location.href;
        routeChangeHandler = () => {
            if (!started || window.location.href === lastUrl) return;
            lastUrl = window.location.href;
            lastOutlineJson = '';
            activeOutlineRequestToken = '';
            activeOutlineRequestUrl = '';
            chrome.runtime.sendMessage({ type: 'routeChanged', url: lastUrl });

            // The in-flight extraction is URL-guarded; the pending latch guarantees one
            // follow-up extraction for the newly selected route.
            scheduleOutlineRefresh(0);
        };

        const patchHistoryMethod = method => {
            const original = window.history?.[method];
            if (typeof original !== 'function') return () => {};
            const patched = function (...args) {
                const result = original.apply(this, args);
                queueMicrotask(routeChangeHandler);
                return result;
            };
            window.history[method] = patched;
            return () => {
                if (window.history[method] === patched) window.history[method] = original;
            };
        };
        const restorePushState = patchHistoryMethod('pushState');
        const restoreReplaceState = patchHistoryMethod('replaceState');
        window.addEventListener('popstate', routeChangeHandler);
        restoreRouteHooks = () => {
            restorePushState();
            restoreReplaceState();
            window.removeEventListener('popstate', routeChangeHandler);
            restoreRouteHooks = null;
        };
        routeWatcher = setInterval(() => {
            routeChangeHandler();
        }, 300);
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
        restoreRouteHooks?.();
        routeChangeHandler = null;
        if (initialRefreshTimer) clearTimeout(initialRefreshTimer);
        initialRefreshTimer = null;
        if (outlineRefreshTimer) clearTimeout(outlineRefreshTimer);
        outlineRefreshTimer = null;
        if (readingDetectionTimer) clearTimeout(readingDetectionTimer);
        readingDetectionTimer = null;
        if (observerRetryTimer) clearTimeout(observerRetryTimer);
        observerRetryTimer = null;
        outlineExtraction = null;
        outlineRefreshPending = false;
        activeOutlineRequestToken = '';
        activeOutlineRequestUrl = '';
        highlightTimers.forEach(timer => clearTimeout(timer));
        highlightTimers.clear();
        activeJumpGeneration++;
        cancelPendingJumps();
        cancelActiveRepair('content-cleanup');
        window.AI_CHAT_CONVERSATION_INDEX?.disconnect?.();
        window.removeEventListener('ai-chat-index-updated', refreshOutlineFromIndex);
        chrome.runtime.onMessage.removeListener(handleMessage);
        chrome.runtime.onConnect.removeListener(handlePanelConnect);
        activePanelPorts.forEach(port => {
            try { port.disconnect(); } catch (_) {}
        });
        activePanelPorts.clear();
        window.CHAT_NAVIGATOR_CONTENT_VERSION = '';
        window.extractAndSendOutline = null;
        window.chatNavigatorCleanup = null;
    };

})();
