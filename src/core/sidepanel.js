// 当前激活标签页ID
let currentTabId = null;
let currentTabUrl = '';
let activeContentPort = null;
let outlineRequestSerial = 0;
let currentOutlineRequestToken = '';
let tabReloadTimer = null;

// 全局状态：是否所有目录都已收起
let allCollapsed = false;
let selectionMode = false;
let currentOutlineData = [];
let licenseStatusState = { active: false, plan: 'free' };
let exportInProgress = false;
const selectedQuestionIndexes = new Set();
const collapsedQuestionKeys = new Set();
const PURCHASE_URL = 'https://wj.qq.com/s2/26957751/9rvt/';
const DEMO_MODE = /(?:^|[?&])demo(?:=1)?(?:&|$)/.test((window.location && window.location.search) || '');
const DEMO_PLATFORM = /(?:^|[?&])platform=doubao(?:&|$)/.test((window.location && window.location.search) || '') ? 'doubao' : 'chatgpt';
const HAS_CHROME_API = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.tabs && chrome.scripting);
const HAS_LOCAL_STORAGE_API = typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
const WELCOME_DISMISSED_KEY = 'aiChatExporterWelcomeDismissed';
const browserLanguage = typeof navigator === 'undefined' ? 'en' : (navigator.languages?.[0] || navigator.language || 'en');
const UI_LANGUAGE = browserLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const UI_COPY = {
    zh: {
        welcomeTipAria: '首次使用提示', welcomeTitle: '从这里开始', welcomeBody: '点击目录可快速定位；底部可免费导出完整对话。',
        openHelp: '打开使用帮助', closeWelcome: '关闭首次使用提示', learnPro: '了解 Pro', activatePro: '激活 Pro',
        exportFormat: '导出格式', markdownFree: 'Markdown · 免费', htmlPro: 'HTML · Pro', jsonPro: 'JSON · Pro', txtPro: 'TXT · Pro',
        collapseAll: '收起所有', expandAll: '展开所有', exportFull: '导出完整对话', exportSelected: '导出已选对话', exporting: '导出中…',
        helpTitle: '使用帮助', closeHelp: '关闭帮助', quickStartTitle: '快速使用', quickStartBody: '点击目录跳转到对应内容；底部“导出完整对话”可免费保存当前对话为 Markdown。',
        longChatTitle: '长对话加载', chatgptLoadingHelp: 'ChatGPT 会优先读取完整会话；暂时无法读取时，使用当前已加载的内容。', doubaoLoadingHelp: '豆包不会被扩展自动滚动。继续浏览原对话，目录会随滚动逐步补全。',
        freeProTitle: '免费版与 Pro', freeProBody: '大纲、定位和完整 Markdown 导出免费。Pro 可勾选重要问题组，并支持 HTML、JSON、TXT 格式。',
        privacyTitle: '隐私', privacyBody: '对话内容在浏览器本地处理，不上传到开发者服务器。', activateLicense: '激活授权码',
        loadingChatgpt: '正在读取完整会话…', loadingDoubao: '正在读取当前内容；目录会随滚动补全', loadingOutline: '正在生成对话目录…',
        readyDoubao: '目录已生成；继续滚动原对话可补全更多内容', readyChatgpt: '目录已生成；长对话会优先读取完整会话', readyOutline: '目录已生成', analyzing: '正在分析页面内容…',
        unsupportedPage: '当前页面不是支持的 AI 对话页面', injectFailed: '无法注入页面分析脚本，请刷新当前页面后重试',
        currentSite: '当前网站：{site}', demoSite: '示例页面：{site} 长对话大纲', demoReady: '示例数据：可直接点击、收起目录或切换部分导出',
        demoPurchase: '示例页面不会打开购买链接', proActive: 'Pro 已激活', activating: '激活中…', activationPrompt: '请输入 Pro 授权码', activationFailed: '激活失败：{error}', unknownError: '未知错误',
        partialExport: '部分导出', exitSelection: '退出选择模式', extracting: '正在提取当前对话并生成 {format}', exportingSelected: '正在将选中的问题组导出为 {format}',
        demoFullExport: '示例：将导出 4 组对话', demoSelectedExport: '示例：将导出 {count} 组已选对话', exportFailed: '导出失败：{error}',
        exportedFull: '已导出 {format}：{count} 组对话', exportedSelected: '已导出 {format}：{count} 组选中对话', selectBeforeExport: '请先勾选要导出的对话',
        demoLocated: '示例：已定位「{item}」', noOutline: '当前页面未找到可用的大纲内容，请打开你的对话', selectQuestion: '选择此问题组用于局部导出'
    },
    en: {
        welcomeTipAria: 'First-use tip', welcomeTitle: 'Start here', welcomeBody: 'Click an outline item to jump to it. Export the full conversation for free below.',
        openHelp: 'Open help', closeWelcome: 'Dismiss first-use tip', learnPro: 'Learn about Pro', activatePro: 'Activate Pro',
        exportFormat: 'Export format', markdownFree: 'Markdown · Free', htmlPro: 'HTML · Pro', jsonPro: 'JSON · Pro', txtPro: 'TXT · Pro',
        collapseAll: 'Collapse all', expandAll: 'Expand all', exportFull: 'Export full chat', exportSelected: 'Export selected chats', exporting: 'Exporting…',
        helpTitle: 'Help', closeHelp: 'Close help', quickStartTitle: 'Quick start', quickStartBody: 'Click an outline item to jump to it. “Export full chat” saves the current conversation as Markdown for free.',
        longChatTitle: 'Long chats', chatgptLoadingHelp: 'ChatGPT first tries to read the complete conversation; when it is unavailable, the extension uses the content already loaded.', doubaoLoadingHelp: 'The extension never scrolls Doubao automatically. Keep browsing the original chat and the outline will fill in as you scroll.',
        freeProTitle: 'Free and Pro', freeProBody: 'Outlines, navigation, and full Markdown exports are free. Pro lets you select question groups and export HTML, JSON, or TXT.',
        privacyTitle: 'Privacy', privacyBody: 'Conversation content is processed locally in your browser and is not uploaded to our servers.', activateLicense: 'Activate license',
        loadingChatgpt: 'Reading the complete conversation…', loadingDoubao: 'Reading the current content; the outline fills in as you scroll', loadingOutline: 'Building conversation outline…',
        readyDoubao: 'Outline ready; keep scrolling the chat to add more content', readyChatgpt: 'Outline ready; long chats use the complete conversation when available', readyOutline: 'Outline ready', analyzing: 'Analyzing page content…',
        unsupportedPage: 'This page is not a supported AI chat', injectFailed: 'Could not analyze this page. Refresh the tab and try again.',
        currentSite: 'Current site: {site}', demoSite: 'Example: {site} long-chat outline', demoReady: 'Example data: click items, collapse the outline, or switch to partial export',
        demoPurchase: 'The example page does not open the purchase link', proActive: 'Pro is active', activating: 'Activating…', activationPrompt: 'Enter your Pro license code', activationFailed: 'Activation failed: {error}', unknownError: 'Unknown error',
        partialExport: 'Partial export', exitSelection: 'Exit selection', extracting: 'Extracting the current chat as {format}', exportingSelected: 'Exporting selected question groups as {format}',
        demoFullExport: 'Example: 4 question groups will be exported', demoSelectedExport: 'Example: {count} selected question groups will be exported', exportFailed: 'Export failed: {error}',
        exportedFull: 'Exported {format}: {count} question groups', exportedSelected: 'Exported {format}: {count} selected question groups', selectBeforeExport: 'Select at least one chat to export',
        demoLocated: 'Example: jumped to “{item}”', noOutline: 'No usable outline was found. Open one of your chats and try again.', selectQuestion: 'Select this question group for partial export'
    }
};
function t(key, values = {}) {
    return (UI_COPY[UI_LANGUAGE][key] || UI_COPY.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
function applyStaticTranslations() {
    document.documentElement.lang = UI_LANGUAGE === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)); });
}
function setSiteInfo(text) {
    const siteInfo = document.getElementById('site-info-text');
    if (siteInfo) siteInfo.textContent = text;
}
const demoQuestion = (index, text) => `问题 ${index}: ${text}`;

// 供 sidepanel-example.html 和 sidepanel.html?demo=1 使用，不读取当前标签页。
const DEMO_OUTLINE = [
    { id: 'demo-q1', type: 'question', level: 'h1', text: demoQuestion(1, '如何为虚拟滚动的 AI 对话设计稳定的导出架构？'), metadata: { index: 1, key: 'demo-q1' } },
    { id: 'demo-a1', type: 'answer', level: 'h2', text: '先建立按消息 ID 去重的会话索引', metadata: { index: 1 } },
    { id: 'demo-a2', type: 'answer', level: 'h3', text: '索引应保存角色、原始顺序、纯文本与可导出的内容', metadata: { index: 1 } },
    { id: 'demo-a3', type: 'answer', level: 'h3', text: '目录刷新必须跟随用户浏览，不应改变阅读位置', metadata: { index: 1 } },
    { id: 'demo-q2', type: 'question', level: 'h1', text: demoQuestion(2, '消息缓存如何保证排序、去重与新 DOM 静默补充？'), metadata: { index: 2, key: 'demo-q2' } },
    { id: 'demo-b1', type: 'answer', level: 'h2', text: '以 data-message-id 为稳定键，重复挂载只更新同一条记录', metadata: { index: 2 } },
    { id: 'demo-b2', type: 'answer', level: 'h3', text: '使用虚拟列表中的绝对位置排序，而不是当前 DOM 的显示顺序', metadata: { index: 2 } },
    { id: 'demo-b3', type: 'answer', level: 'h4', text: '用户滚动或目录跳转导致挂载新节点后，再安静地补全目录', metadata: { index: 2 } },
    { id: 'demo-q3', type: 'question', level: 'h1', text: demoQuestion(3, '一个很长的问题标题示例：侧栏在窄宽度下如何保持可读性、层级关系和点击区域？'), metadata: { index: 3, key: 'demo-q3' } },
    { id: 'demo-c1', type: 'answer', level: 'h2', text: '当前阅读位置与目录跳转状态', metadata: { index: 3 } },
    { id: 'demo-c2', type: 'answer', level: 'h3', text: '支持展开、收起、全局收起和 Pro 局部导出选择', metadata: { index: 3 } },
    { id: 'demo-q4', type: 'question', level: 'h1', text: demoQuestion(4, '导出时怎样向用户说明索引范围？'), metadata: { index: 4, key: 'demo-q4' } },
    { id: 'demo-d1', type: 'answer', level: 'h2', text: '已完整获取的会话与被动索引内容需要明确区分', metadata: { index: 4 } }
];

const SUPPORTED_URL_SNIPPETS = [
    'deepseek.com',
    'deepseek.ai',
    'yuanbao.tencent.com',
    'chatgpt.com',
    'doubao.com',
    'gemini.google.com',
    'grok.com',
    'kimi.com',
    'moonshot.cn'
];

const CONTENT_SCRIPT_FILES = [
    'src/config/selectors.js',
    'src/utils/common.js',
    'src/core/conversation-index.js',
    'src/core/pipeline.js',
    'src/core/content.js'
];

function isSupportedUrl(url = '') {
    return SUPPORTED_URL_SNIPPETS.some(snippet => url.includes(snippet));
}

function setOutlineLoadStatus(url = '') {
    if (url.includes('chatgpt.com')) {
        setExportStatus(t('loadingChatgpt'), 'neutral');
    } else if (url.includes('doubao.com')) {
        setExportStatus(t('loadingDoubao'), 'neutral');
    } else {
        setExportStatus(t('loadingOutline'), 'neutral');
    }
}

function setOutlineReadyStatus(url = '') {
    if (exportInProgress) return;
    if (url.includes('doubao.com')) {
        setExportStatus(t('readyDoubao'), 'neutral');
    } else if (url.includes('chatgpt.com')) {
        setExportStatus(t('readyChatgpt'), 'neutral');
    } else {
        setExportStatus(t('readyOutline'), 'neutral');
    }
}

async function injectCurrentContentScripts(tabId, url = '') {
    if (url.includes('chatgpt.com')) {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ['src/core/chatgpt-api-bridge.js']
        });
    }
    await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES
    });
}

function disconnectActiveContentPort() {
    const port = activeContentPort;
    activeContentPort = null;
    if (!port) return;
    try { port.disconnect(); } catch (_) {}
}

function connectContentLifecycle(tabId) {
    disconnectActiveContentPort();
    if (!chrome.tabs.connect) return;
    const port = chrome.tabs.connect(tabId, { name: 'ai-chat-exporter-panel' });
    activeContentPort = port;
    port.onDisconnect.addListener(() => {
        if (activeContentPort === port) activeContentPort = null;
    });
}

function scheduleReloadOutlineRequest() {
    if (tabReloadTimer) clearTimeout(tabReloadTimer);
    tabReloadTimer = setTimeout(() => {
        tabReloadTimer = null;
        requestCurrentTabOutline();
    }, 180);
}

function cleanupContentLifecycle() {
    if (tabReloadTimer) clearTimeout(tabReloadTimer);
    tabReloadTimer = null;
    disconnectActiveContentPort();
}

function clearOutlineForRequest() {
    currentOutlineData = [];
    selectedQuestionIndexes.clear();
    collapsedQuestionKeys.clear();
    allCollapsed = false;
    const outlineContainer = document.getElementById('outline');
    if (outlineContainer) outlineContainer.innerHTML = `<div class="loading-state"><p>${t('analyzing')}</p></div>`;
    updateToggleAllButton();
    updatePanelState();
    return outlineContainer;
}

// 主动请求当前标签页大纲
function requestCurrentTabOutline() {
    if (DEMO_MODE || !HAS_CHROME_API) return;
    if (tabReloadTimer) clearTimeout(tabReloadTimer);
    tabReloadTimer = null;
    const requestSerial = ++outlineRequestSerial;
    const requestToken = `${Date.now()}:${requestSerial}:${Math.random().toString(36).slice(2)}`;
    currentOutlineRequestToken = requestToken;
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (tabs[0] && requestSerial === outlineRequestSerial && requestToken === currentOutlineRequestToken) {
            disconnectActiveContentPort();
            currentTabId = tabs[0].id;
            currentTabUrl = tabs[0].url || '';
            const outlineContainer = clearOutlineForRequest();
            setOutlineLoadStatus(currentTabUrl);

            try {
                if (isSupportedUrl(tabs[0].url)) {
                    await injectCurrentContentScripts(currentTabId, tabs[0].url || '');
                    if (requestSerial !== outlineRequestSerial || requestToken !== currentOutlineRequestToken) return;
                    connectContentLifecycle(currentTabId);
                    await chrome.tabs.sendMessage(currentTabId, {
                        type: 'getOutline',
                        requestToken,
                        url: currentTabUrl
                    });
                } else {
                    showErrorMessage(outlineContainer, t('unsupportedPage'));
                }
            } catch (err) {
                showErrorMessage(outlineContainer, t('injectFailed'), {
                    error: err.message
                });
            }
        }
    });
}

// 侧边栏加载时请求大纲
window.addEventListener('load', () => {
    applyStaticTranslations();
    // 初始化一键操作按钮
    initializeToggleAllButton();
    initializePanelActionControls();
    initializeHelpControls();
    initializeWelcomeTip();
    if (DEMO_MODE) {
        setSiteInfo(t('demoSite', { site: DEMO_PLATFORM === 'chatgpt' ? 'ChatGPT' : '豆包' }));
        renderLicenseStatus({ active: true, plan: 'demo' });
        displayOutline(DEMO_OUTLINE);
        setExportStatus(t('demoReady'), 'success');
        return;
    }
    requestCurrentTabOutline();
    refreshLicenseStatus();
});

// 监听标签切换
if (HAS_CHROME_API) {
    chrome.tabs.onActivated && chrome.tabs.onActivated.addListener(requestCurrentTabOutline);
    chrome.tabs.onUpdated && chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (!tab.active) return;
        if (changeInfo.url) requestCurrentTabOutline();
        else if (changeInfo.status === 'complete') scheduleReloadOutlineRequest();
    });
    window.addEventListener('unload', cleanupContentLifecycle);
}

// 监听来自content script的消息
if (HAS_CHROME_API && chrome.runtime.onMessage?.addListener) chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 只处理当前激活标签页返回的消息
    if (sender.tab && sender.tab.id !== currentTabId) return;
    if (message.type === 'routeChanged') {
        if (!message.url || !sender.tab || sender.tab.id !== currentTabId) return;
        // Immediately invalidate the previous route so a late outline cannot flash
        // after the user has already selected another ChatGPT conversation.
        // sender.tab.url can lag behind pushState. Only adopt it when both surfaces
        // agree; either way, invalidate the old token and re-query the active tab.
        if (!sender.tab.url || message.url === sender.tab.url) currentTabUrl = message.url;
        outlineRequestSerial++;
        currentOutlineRequestToken = '';
        clearOutlineForRequest();
        setOutlineLoadStatus(currentTabUrl);
        // Cancelling an injection without scheduling its replacement can strand the panel
        // with no lifecycle port. Always rebuild against the settled active route.
        scheduleReloadOutlineRequest();
        return;
    }
    if (message.type === 'outline') {
        const outlineUrl = message.diagnostics?.url || '';
        if (!message.requestToken || message.requestToken !== currentOutlineRequestToken) return;
        if (!outlineUrl || (currentTabUrl && outlineUrl !== currentTabUrl)) return;

        displayOutline(message.outline, message.diagnostics);
        // 显示网站类型
        const url = sender.tab && sender.tab.url ? sender.tab.url : '';
        if (document.getElementById('site-info-text')) {
            let site = '';
            if (url.includes('deepseek.com')) {
                site = 'DeepSeek Chat';
            } else if (url.includes('yuanbao.tencent.com')) {
                site = '元宝 AI';
            } else if (url.includes('chatgpt.com')) {
                site = 'ChatGPT';
            } else if (url.includes('gemini.google.com')) {
                site = 'Google Gemini';
            } else if (url.includes('grok.com')) {
                site = 'Grok';
            } else if (url.includes('doubao.com')) {
                site = '豆包 AI';
            } else if (url.includes('kimi.com') || url.includes('kimi.moonshot.cn')) {
                site = 'Kimi';
            } else {
                site = UI_LANGUAGE === 'zh' ? '普通网页' : 'Web page';
            }
            setSiteInfo(t('currentSite', { site }));
        }
        setOutlineReadyStatus(url);
    } else if (message.type === 'updateReadingPosition') {
        highlightCurrentReadingPosition(message.elementId, message.elementText);
    }
});

// 高亮当前阅读位置
function highlightCurrentReadingPosition(elementId, elementText) {
    // 移除之前的高亮
    document.querySelectorAll('.outline-item').forEach(item => {
        item.classList.remove('current-reading');
    });
    
    // 只用id查找对应的大纲项
    const targetItem = document.querySelector(`.outline-item[data-element-id="${elementId}"]`);
    if (targetItem) {
        // 添加高亮样式
        targetItem.classList.add('current-reading');
        // 平滑滚动到当前项
        targetItem.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
        });
        // 更新阅读进度指示器
        updateReadingProgress(targetItem);
    }
}

// 更新阅读进度指示器
function updateReadingProgress(currentItem) {
    const allItems = document.querySelectorAll('.outline-item');
    const currentIndex = Array.from(allItems).indexOf(currentItem);
    const progress = ((currentIndex + 1) / allItems.length) * 100;

    // 更新进度条 - 样式由 CSS 控制
    let progressBar = document.getElementById('reading-progress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'reading-progress';
        document.body.appendChild(progressBar);
    }

    progressBar.style.width = `${progress}%`;
}

function setExportStatus(message, tone = 'neutral') {
    const exportStatus = document.getElementById('export-status');
    if (!exportStatus) return;
    exportStatus.textContent = message;
    exportStatus.dataset.tone = tone;
}

function getQuestionIndex(question) {
    const index = question?.metadata?.index;
    return Number.isInteger(index) ? index : null;
}

function getQuestionCollapseKey(question) {
    const metadata = question?.metadata || {};
    if (metadata.key) return metadata.key;
    if (Number.isFinite(metadata.turnNumber)) return `turn:${metadata.turnNumber}`;
    if (Number.isFinite(metadata.promptNumber)) return `prompt:${metadata.promptNumber}`;
    return question?.id || question?.text || '';
}

function initializePanelActionControls() {
    const purchaseButton = document.getElementById('pro-purchase-action');
    const proActionButton = document.getElementById('pro-mode-action');
    const bottomExportButton = document.getElementById('bottom-export-btn');
    const formatSelect = document.getElementById('export-format');

    if (purchaseButton) {
        purchaseButton.addEventListener('click', openPurchasePage);
    }

    if (proActionButton) {
        proActionButton.addEventListener('click', () => {
            if (!licenseStatusState.active) {
                activateProLicense(proActionButton);
                return;
            }

            selectionMode = !selectionMode;
            if (!selectionMode) selectedQuestionIndexes.clear();
            renderCurrentOutline();
            updatePanelState();
        });
    }

    if (bottomExportButton) {
        bottomExportButton.addEventListener('click', () => {
            if (selectionMode) {
                exportSelectedChat();
            } else {
                exportFullChat();
            }
        });
    }

    formatSelect?.addEventListener('change', updatePanelState);

    updatePanelState();
}

function openPurchasePage() {
    if (DEMO_MODE || !HAS_CHROME_API) {
        setExportStatus(t('demoPurchase'), 'neutral');
        return;
    }
    chrome.tabs.create({ url: PURCHASE_URL });
}

function initializeHelpControls() {
    const helpButton = document.getElementById('help-button');
    const helpDrawer = document.getElementById('help-drawer');
    const closeButton = document.getElementById('help-close-button');
    const purchaseButton = document.getElementById('help-purchase-action');
    const activateButton = document.getElementById('help-activate-action');
    const proActionButton = document.getElementById('pro-mode-action');
    if (!helpButton || !helpDrawer) return;

    const closeHelp = () => {
        helpDrawer.hidden = true;
        helpButton.setAttribute('aria-expanded', 'false');
        helpButton.focus();
    };
    const openHelp = () => {
        helpDrawer.hidden = false;
        helpButton.setAttribute('aria-expanded', 'true');
        closeButton?.focus();
    };

    helpButton.addEventListener('click', openHelp);
    closeButton?.addEventListener('click', closeHelp);
    helpDrawer.addEventListener('click', event => {
        if (event.target === helpDrawer) closeHelp();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !helpDrawer.hidden) closeHelp();
    });
    purchaseButton?.addEventListener('click', openPurchasePage);
    activateButton?.addEventListener('click', () => {
        closeHelp();
        if (licenseStatusState.active) {
            setExportStatus(t('proActive'), 'success');
            return;
        }
        activateProLicense(proActionButton || activateButton);
    });
}

function initializeWelcomeTip() {
    const welcomeTip = document.getElementById('welcome-tip');
    const dismissButton = document.getElementById('welcome-dismiss');
    if (!welcomeTip || !dismissButton) return;

    const hideTip = () => {
        welcomeTip.hidden = true;
        if (HAS_LOCAL_STORAGE_API) {
            chrome.storage.local.set({ [WELCOME_DISMISSED_KEY]: true });
        } else {
            window.localStorage?.setItem(WELCOME_DISMISSED_KEY, 'true');
        }
    };

    dismissButton.addEventListener('click', hideTip);
    if (DEMO_MODE) {
        welcomeTip.hidden = false;
        return;
    }
    if (HAS_LOCAL_STORAGE_API) {
        chrome.storage.local.get(WELCOME_DISMISSED_KEY, result => {
            welcomeTip.hidden = Boolean(result?.[WELCOME_DISMISSED_KEY]);
        });
    } else {
        welcomeTip.hidden = window.localStorage?.getItem(WELCOME_DISMISSED_KEY) === 'true';
    }
}

function refreshLicenseStatus() {
    if (DEMO_MODE || !HAS_CHROME_API) {
        renderLicenseStatus({ active: true, plan: 'demo' });
        return;
    }
    chrome.runtime.sendMessage({ action: 'getLicenseStatus' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
            renderLicenseStatus({ active: false, plan: 'free' });
            return;
        }
        renderLicenseStatus(response.status);
    });
}

function renderLicenseStatus(status = {}) {
    licenseStatusState = status.active
        ? { ...status, active: true }
        : { ...status, active: false, plan: 'free' };

    if (!licenseStatusState.active && selectionMode) {
        selectionMode = false;
        selectedQuestionIndexes.clear();
    }

    updatePanelState();
}

function activateProLicense(triggerButton) {
    const code = window.prompt(t('activationPrompt'));
    if (!code) return;

    triggerButton.disabled = true;
    triggerButton.textContent = t('activating');
    chrome.runtime.sendMessage({ action: 'activateLicense', code }, (response) => {
        triggerButton.disabled = false;

        if (chrome.runtime.lastError) {
            setExportStatus(t('activationFailed', { error: chrome.runtime.lastError.message }), 'error');
            refreshLicenseStatus();
            return;
        }

        if (!response || !response.success) {
            setExportStatus(t('activationFailed', { error: response?.error || t('unknownError') }), 'error');
            refreshLicenseStatus();
            return;
        }

        setExportStatus(t('proActive'), 'success');
        renderLicenseStatus(response.status);
    });
}

function updatePanelState() {
    const purchaseButton = document.getElementById('pro-purchase-action');
    const proActionButton = document.getElementById('pro-mode-action');
    const bottomExportButton = document.getElementById('bottom-export-btn');
    const formatSelect = document.getElementById('export-format');
    const selectedCount = selectedQuestionIndexes.size;
    const isPro = Boolean(licenseStatusState.active);

    if (formatSelect) {
        formatSelect.querySelectorAll?.('[data-pro-format]')?.forEach(option => {
            option.disabled = !isPro;
        });
        if (!isPro && formatSelect.value !== 'markdown') formatSelect.value = 'markdown';
        formatSelect.disabled = exportInProgress;
    }
    if (purchaseButton) {
        purchaseButton.hidden = isPro;
        purchaseButton.disabled = exportInProgress;
    }

    if (proActionButton) {
        proActionButton.disabled = exportInProgress;
        proActionButton.classList.remove('activate', 'partial', 'exit', 'full-row');
        if (!isPro) {
            proActionButton.textContent = t('activatePro');
            proActionButton.classList.add('activate');
        } else if (selectionMode) {
            proActionButton.textContent = t('exitSelection');
            proActionButton.classList.add('exit', 'full-row');
        } else {
            proActionButton.textContent = t('partialExport');
            proActionButton.classList.add('partial', 'full-row');
        }
    }

    if (bottomExportButton) {
        if (exportInProgress) {
            bottomExportButton.disabled = true;
            bottomExportButton.textContent = t('exporting');
            return;
        }

        bottomExportButton.textContent = selectionMode ? t('exportSelected') : t('exportFull');
        bottomExportButton.disabled = selectionMode && selectedCount === 0;
    }
}

function getExportFormat() {
    return document.getElementById('export-format')?.value || 'markdown';
}

function getExportFormatLabel() {
    const select = document.getElementById('export-format');
    return select?.selectedOptions?.[0]?.textContent?.split('·')[0]?.trim() || 'Markdown';
}

function exportFullChat() {
    const bottomExportButton = document.getElementById('bottom-export-btn');
    if (!bottomExportButton || exportInProgress) return;

    exportInProgress = true;
    updatePanelState();
    const format = getExportFormat();
    const formatLabel = getExportFormatLabel();
    setExportStatus(t('extracting', { format: formatLabel }));

    if (DEMO_MODE) {
        exportInProgress = false;
        updatePanelState();
        setExportStatus(t('demoFullExport'), 'success');
        return;
    }

    chrome.runtime.sendMessage({ action: 'exportFullChat', format }, (response) => {
        exportInProgress = false;
        updatePanelState();

        if (chrome.runtime.lastError) {
            setExportStatus(t('exportFailed', { error: chrome.runtime.lastError.message }), 'error');
            return;
        }

        if (!response || !response.success) {
            setExportStatus(t('exportFailed', { error: response?.error || t('unknownError') }), 'error');
            return;
        }

        setExportStatus(t('exportedFull', { format: response.formatLabel || formatLabel, count: response.count || 0 }), 'success');
    });
}

function exportSelectedChat() {
    if (exportInProgress) return;

    const questionIndexes = Array.from(selectedQuestionIndexes).sort((a, b) => a - b);
    if (questionIndexes.length === 0) {
        setExportStatus(t('selectBeforeExport'), 'error');
        updatePanelState();
        return;
    }

    exportInProgress = true;
    updatePanelState();
    const format = getExportFormat();
    const formatLabel = getExportFormatLabel();
    setExportStatus(t('exportingSelected', { format: formatLabel }));

    if (DEMO_MODE) {
        exportInProgress = false;
        updatePanelState();
        setExportStatus(t('demoSelectedExport', { count: questionIndexes.length }), 'success');
        return;
    }

    chrome.runtime.sendMessage({ action: 'exportSelectedChat', questionIndexes, format }, (response) => {
        exportInProgress = false;
        updatePanelState();

        if (chrome.runtime.lastError) {
            setExportStatus(t('exportFailed', { error: chrome.runtime.lastError.message }), 'error');
            return;
        }

        if (!response || !response.success) {
            setExportStatus(t('exportFailed', { error: response?.error || t('unknownError') }), 'error');
            return;
        }

        setExportStatus(t('exportedSelected', { format: response.formatLabel || formatLabel, count: response.count || 0 }), 'success');
    });
}

function renderCurrentOutline() {
    if (currentOutlineData.length > 0) {
        displayOutline(currentOutlineData);
    }
}

function scrollToOutlineItem(item) {
    if (DEMO_MODE || !HAS_CHROME_API) {
        document.querySelectorAll('.outline-item').forEach(node => node.classList.remove('current-reading'));
        const target = document.querySelector(`.outline-item[data-element-id="${item.id}"]`);
        if (target) target.classList.add('current-reading');
        setExportStatus(t('demoLocated', { item: item.text }), 'neutral');
        return;
    }

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'scrollTo',
            elementId: item.id,
            metadata: item.metadata
        });
    });
}

// 显示大纲
function displayOutline(outlineData, diagnostics) {
    const outlineContainer = document.getElementById('outline');
    currentOutlineData = Array.isArray(outlineData) ? outlineData : [];
    
    // 检查是否有大纲数据
    if (!outlineData || outlineData.length === 0) {
        selectedQuestionIndexes.clear();
        updatePanelState();
        showErrorMessage(outlineContainer, t('noOutline'), diagnostics);
        return;
    }

    outlineContainer.innerHTML = '';

    const hasQuestion = outlineData.some(item => item.type === 'question');
    if (!hasQuestion) {
        selectedQuestionIndexes.clear();
        renderFlatOutline(outlineData, outlineContainer);
        updatePanelState();
        return;
    }
    
    let currentQuestion = null;
    let questionAnswers = [];
    
    outlineData.forEach(item => {
        if (item.type === 'question') {
            // 如果有上一个问题，先渲染它
            if (currentQuestion) {
                renderQuestionGroup(currentQuestion, questionAnswers, outlineContainer);
            }
            // 开始新的问题组
            currentQuestion = item;
            questionAnswers = [];
        } else {
            // 收集问题的答案和子标题
            questionAnswers.push(item);
        }
    });
    
    // 渲染最后一个问题组
    if (currentQuestion) {
        renderQuestionGroup(currentQuestion, questionAnswers, outlineContainer);
    }

    updatePanelState();
}

function renderFlatOutline(items, container) {
    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `outline-item ${item.level} ${item.type}`;
        itemDiv.textContent = item.text;
        itemDiv.setAttribute('data-element-id', item.id);

        if (item.metadata) {
            itemDiv.dataset.metadata = JSON.stringify(item.metadata);
        }

        itemDiv.addEventListener('click', () => scrollToOutlineItem(item));

        container.appendChild(itemDiv);
    });
}

function renderQuestionLabel(container, rawText) {
    const text = String(rawText || '');
    const match = text.match(/^问题\s*(\d+)\s*:\s*(你说：)?\s*(.*)$/);
    if (!match) {
        container.textContent = text;
        return;
    }

    const [, number, speaker = '', body] = match;
    const label = document.createElement('span');
    label.className = 'question-label';
    label.textContent = 'Q';

    const numberSpan = document.createElement('span');
    numberSpan.className = 'question-number';
    numberSpan.textContent = number;
    label.appendChild(numberSpan);
    const colon = document.createElement('span');
    colon.textContent = ':';
    label.appendChild(colon);
    container.appendChild(label);

    if (speaker) {
        const speakerSpan = document.createElement('span');
        speakerSpan.className = 'question-speaker';
        speakerSpan.textContent = speaker;
        container.appendChild(speakerSpan);
    }

    if (body) {
        const bodySpan = document.createElement('span');
        bodySpan.textContent = body;
        container.appendChild(bodySpan);
    }
}

// 渲染问题组（问题及其答案）
function renderQuestionGroup(question, answers, container) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'question-group';
    const collapseKey = getQuestionCollapseKey(question);
    if (collapseKey) groupDiv.dataset.collapseKey = collapseKey;

    // 创建问题元素
    const questionDiv = document.createElement('div');
    questionDiv.className = `outline-item ${question.level} ${question.type}`;
    questionDiv.setAttribute('data-element-id', question.id);
    // 存储元数据
    if (question.metadata) {
        questionDiv.dataset.metadata = JSON.stringify(question.metadata);
    }

    // 创建展开/收起图标 - 使用 CSS 类控制
    const toggle = document.createElement('span');
    const initiallyCollapsed = allCollapsed || collapsedQuestionKeys.has(collapseKey);
    toggle.className = `toggle-icon ${initiallyCollapsed ? 'collapsed' : 'expanded'}`;
    questionDiv.appendChild(toggle);

    const questionIndex = getQuestionIndex(question);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = `selection-checkbox${selectionMode ? '' : ' hidden'}`;
    checkbox.checked = questionIndex !== null && selectedQuestionIndexes.has(questionIndex);
    checkbox.setAttribute('aria-label', t('selectQuestion'));
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (questionIndex === null) return;
        if (checkbox.checked) {
            selectedQuestionIndexes.add(questionIndex);
        } else {
            selectedQuestionIndexes.delete(questionIndex);
        }
        updatePanelState();
    });
    questionDiv.appendChild(checkbox);

    // 添加问题文本
    const text = document.createElement('span');
    text.className = 'question-text';
    renderQuestionLabel(text, question.text);
    questionDiv.appendChild(text);

    // 创建答案容器
    const answersDiv = document.createElement('div');
    answersDiv.className = `answers-container${initiallyCollapsed ? ' collapsing' : ''}`;
    // 移除初始 display 设置，由 CSS max-height 控制

    // 添加问题点击事件（跳转）
    questionDiv.addEventListener('click', (e) => {
        if (e.target !== toggle && !e.target.closest('.toggle-icon')) {
            scrollToOutlineItem(question);
        }
    });

    // 添加展开/收起功能
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = toggle.classList.contains('expanded');
        toggle.classList.toggle('expanded', !isExpanded);
        toggle.classList.toggle('collapsed', isExpanded);

        if (isExpanded) {
            if (collapseKey) collapsedQuestionKeys.add(collapseKey);
            // 收起：测量当前高度，设置明确高度，强制重绘，然后收起
            const currentHeight = answersDiv.offsetHeight;
            answersDiv.style.height = currentHeight + 'px';
            // 强制重绘，确保浏览器注册起始值
            answersDiv.offsetHeight;
            answersDiv.classList.add('collapsing');
            // 过渡完成后清理内联样式
            const onEnd = () => {
                answersDiv.style.height = '';
                answersDiv.removeEventListener('transitionend', onEnd);
            };
            answersDiv.addEventListener('transitionend', onEnd);
        } else {
            if (collapseKey) collapsedQuestionKeys.delete(collapseKey);
            // 展开：移除 collapsing，测量目标高度，动画到目标
            answersDiv.classList.remove('collapsing');
            answersDiv.style.height = 'auto';
            const targetHeight = answersDiv.offsetHeight;
            answersDiv.style.height = '0px';
            // 强制重绘
            answersDiv.offsetHeight;
            answersDiv.style.height = targetHeight + 'px';
            // 过渡完成后清理内联样式
            const onEnd = () => {
                answersDiv.style.height = '';
                answersDiv.removeEventListener('transitionend', onEnd);
            };
            answersDiv.addEventListener('transitionend', onEnd);
        }

        // 检查是否所有目录都已收起
        updateGlobalCollapseState();
    });

    // 渲染所有答案和子标题
    answers.forEach(answer => {
        const answerDiv = document.createElement('div');
        answerDiv.className = `outline-item ${answer.level} ${answer.type}`;
        answerDiv.textContent = answer.text;
        answerDiv.setAttribute('data-element-id', answer.id);
        // 存储元数据
        if (answer.metadata) {
            answerDiv.dataset.metadata = JSON.stringify(answer.metadata);
        }

        // 添加答案点击事件
        answerDiv.addEventListener('click', () => scrollToOutlineItem(answer));

        answersDiv.appendChild(answerDiv);
    });

    groupDiv.appendChild(questionDiv);
    groupDiv.appendChild(answersDiv);
    container.appendChild(groupDiv);
}

// 初始化一键操作按钮
function initializeToggleAllButton() {
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', toggleAllDirectories);
    }
}

// 检查并更新全局收起状态
function updateGlobalCollapseState() {
    const allToggles = document.querySelectorAll('.toggle-icon');
    const allAnswersContainers = document.querySelectorAll('.answers-container');

    if (allToggles.length === 0) return;

    // 检查是否所有目录都已收起 - 使用 collapsing 类
    let allCurrentlyCollapsed = true;
    allAnswersContainers.forEach(container => {
        if (!container.classList.contains('collapsing')) {
            allCurrentlyCollapsed = false;
        }
    });

    // 更新全局状态和按钮
    allCollapsed = allCurrentlyCollapsed;
    updateToggleAllButton();
}

function updateToggleAllButton() {
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    if (!toggleAllBtn) return;

    const icon = toggleAllBtn.querySelector?.('.icon');
    const text = toggleAllBtn.querySelector?.('.text');

    if (allCollapsed) {
        toggleAllBtn.classList.add('collapsed');
        if (icon) icon.textContent = '▶';
        if (text) text.textContent = t('expandAll');
    } else {
        toggleAllBtn.classList.remove('collapsed');
        if (icon) icon.textContent = '▼';
        if (text) text.textContent = t('collapseAll');
    }
}

// 一键收起/展开所有目录
function toggleAllDirectories() {
    const allToggles = document.querySelectorAll('.toggle-icon');
    const allAnswersContainers = document.querySelectorAll('.answers-container');

    allCollapsed = !allCollapsed;
    updateToggleAllButton();
    if (!allCollapsed) collapsedQuestionKeys.clear();

    // 更新所有目录状态 - 使用 height 动画
    allToggles.forEach((toggle, index) => {
        const answersContainer = allAnswersContainers[index];
        if (!answersContainer) return;
        const collapseKey = toggle.closest('.question-group')?.dataset.collapseKey;

        if (allCollapsed) {
            if (collapseKey) collapsedQuestionKeys.add(collapseKey);
            // 收起：测量、设置、强制重绘、添加类
            toggle.classList.remove('expanded');
            toggle.classList.add('collapsed');
            const currentHeight = answersContainer.offsetHeight;
            answersContainer.style.height = currentHeight + 'px';
            answersContainer.offsetHeight;
            answersContainer.classList.add('collapsing');
            const onEnd = () => {
                answersContainer.style.height = '';
                answersContainer.removeEventListener('transitionend', onEnd);
            };
            answersContainer.addEventListener('transitionend', onEnd);
        } else {
            if (collapseKey) collapsedQuestionKeys.delete(collapseKey);
            // 展开：移除类、测量、动画
            toggle.classList.remove('collapsed');
            toggle.classList.add('expanded');
            answersContainer.classList.remove('collapsing');
            answersContainer.style.height = 'auto';
            const targetHeight = answersContainer.offsetHeight;
            answersContainer.style.height = '0px';
            answersContainer.offsetHeight;
            answersContainer.style.height = targetHeight + 'px';
            const onEnd = () => {
                answersContainer.style.height = '';
                answersContainer.removeEventListener('transitionend', onEnd);
            };
            answersContainer.addEventListener('transitionend', onEnd);
        }
    });
}

// 添加错误消息显示函数
function showErrorMessage(container, message, diagnostics) {
    let diagnosticHtml = '';
    if (diagnostics) {
        diagnosticHtml = `
            <div class="diagnostic-info">
                <details>
                    <summary>调试诊断信息 (排查问题用)</summary>
                    <div class="diagnostic-content">
Platform: ${diagnostics.platform}
Strategy: ${diagnostics.strategy}
URL: ${diagnostics.url}
Stats: ${JSON.stringify(diagnostics.stats, null, 2)}
ConfigFound: ${diagnostics.configFound}
Error: ${diagnostics.error || 'None'}
                    </div>
                </details>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="error-message">
            <h3>提示</h3>
            <p>${message}</p>
            <div style="margin-top: 15px;">
                <p>支持的网站类型：</p>
                <ul style="margin-top: 8px; padding-left: 20px;">
                    <li>
                        <a href="https://chat.deepseek.com/" target="_blank">
                            DeepSeek Chat
                        </a>
                    </li>
                    <li>
                        <a href="https://yuanbao.tencent.com/" target="_blank">
                            元宝 AI
                        </a>
                    </li>
                    <li>
                        <a href="https://chat.openai.com/" target="_blank">
                            ChatGPT
                        </a>
                    </li>
                    <li>
                        <a href="https://gemini.google.com/" target="_blank">
                            Google Gemini
                        </a>
                    </li>
                    <li>
                        <a href="https://grok.x.ai/" target="_blank">
                            Grok
                        </a>
                    </li>
                    <li>
                        <a href="https://doubao.com/" target="_blank">
                            豆包 AI
                        </a>
                    </li>
                    <li>
                        <a href="https://kimi.moonshot.cn/" target="_blank">
                            Kimi 智能助手
                        </a>
                    </li>
                </ul>
            </div>
            ${diagnosticHtml}
            <p style="margin-top: 15px; font-size: 12px; color: var(--text-tertiary);">
                点击网站名称可直接访问对应网站
            </p>
        </div>
    `;
} 
