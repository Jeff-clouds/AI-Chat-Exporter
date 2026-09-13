// 当前激活标签页ID
let currentTabId = null;
let currentTabUrl = '';
let activeContentPort = null;
let activeContentTabId = null;
let outlineRequestSerial = 0;
let currentOutlineRequestToken = '';
let tabReloadTimer = null;
let jumpRequestSerial = 0;
let locateRetryTarget = null;

// 全局状态：是否所有目录都已收起
let allCollapsed = false;
let selectionMode = false;
let currentOutlineData = [];
let licenseStatusState = { active: false, plan: 'free' };
let exportInProgress = false;
let runtimeStatus = null;
let transientStatusTimer = null;
const selectedQuestionIndexes = new Set();
const collapsedQuestionKeys = new Set();
const PURCHASE_URL = 'https://wj.qq.com/s2/26957751/9rvt/';
const DEMO_MODE = /(?:^|[?&])demo(?:=1)?(?:&|$)/.test((window.location && window.location.search) || '');
const DEMO_PLATFORM = /(?:^|[?&])platform=doubao(?:&|$)/.test((window.location && window.location.search) || '') ? 'doubao' : 'chatgpt';
const HAS_CHROME_API = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.tabs && chrome.scripting);
const HAS_LOCAL_STORAGE_API = typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
const WELCOME_DISMISSED_KEY = 'aiChatExporterWelcomeDismissed';
const RUNTIME_STATUS_KEY_PREFIX = 'aiChatExporterRuntimeStatus:';
const browserLanguage = typeof navigator === 'undefined' ? 'en' : (navigator.languages?.[0] || navigator.language || 'en');
const UI_LANGUAGE = browserLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const UI_COPY = {
    zh: {
        welcomeTipAria: '首次使用提示', welcomeTitle: '从这里开始', welcomeBody: '点击目录可快速定位；底部可免费导出完整对话。',
        openHelp: '打开使用帮助', closeWelcome: '关闭首次使用提示', learnPro: '了解 Pro', activatePro: '激活 Pro',
        exportFormat: '导出格式', markdownFree: 'Markdown · 免费', htmlPro: 'HTML · Pro', jsonPro: 'JSON · Pro', txtPro: 'TXT · Pro',
        collapseAll: '收起所有', expandAll: '展开所有', exportFull: '导出完整对话', exportFullCount: '导出完整对话（{count} 组）', exportSelected: '导出已选对话', exporting: '导出中…',
        helpTitle: '使用帮助', closeHelp: '关闭帮助', quickStartTitle: '从哪里开始', quickStartBody: '打开一段已加载的 AI 对话后，扩展会自动生成问题与回答的目录。先等待状态行显示“已识别”或“目录正在补全”，再开始定位或导出。',
        outlineHelpTitle: '浏览与定位目录', outlineHelpOpen: '点击问题卡片可展开或收起该问题下的回答；“收起所有 / 展开所有”只改变侧边栏的阅读状态，不会影响原对话。', outlineHelpJump: '点击目录中的具体内容会尝试定位原页面对应位置。长对话的目标若暂未挂载，可先正常浏览到相近位置，或使用“重试定位”。',
        longChatTitle: '长对话与状态提示', chatgptLoadingHelp: 'ChatGPT 会优先读取完整会话。状态显示“正在读取”或“目录正在补全”时，请稍候；此时目录可能只包含已读取的内容。', doubaoLoadingHelp: '豆包不会被扩展自动滚动。继续正常浏览原对话，目录会随着页面加载的内容逐步补全。', statusHelp: '状态行出现红色提示时，可使用“重新检测”重新读取当前标签页；“!” 会打开详情，仅包含问题说明和复制诊断信息。',
        freeProTitle: '导出与 Pro', freeProBody: '“导出完整对话”可免费导出当前已索引内容为 Markdown。激活 Pro 后，可勾选需要保留的问题组并导出 HTML、JSON 或 TXT；切换格式不会改动原网页内容。',
        privacyTitle: '隐私与反馈', privacyBody: '对话内容在浏览器本地处理，不上传到开发者服务器。复制的诊断信息只用于排查运行状态，不包含对话正文、页面地址或账号信息。', activateLicense: '激活授权码',
        loadingChatgpt: '正在读取完整会话…', loadingDoubao: '正在读取当前内容；目录会随滚动补全', loadingOutline: '正在生成对话目录…',
        analyzing: '正在分析页面内容…',
        emptyOutlineStatus: '当前未生成可用目录', rescan: '重新检测', copyDiagnostics: '复制诊断信息', copiedDiagnostics: '诊断信息已复制', copyDiagnosticsFailed: '无法复制诊断信息，请重试', statusDetails: '查看状态详情与操作', closeStatusDetails: '关闭状态详情', errorTitle: '提示', supportedSites: '支持的网站类型：', visitSites: '点击网站名称可直接访问对应网站', yuanbaoName: '元宝 AI', doubaoName: '豆包 AI', kimiName: 'Kimi 智能助手',
        unsupportedPage: '当前页面不是支持的 AI 对话页面', injectFailed: '无法注入页面分析脚本，请刷新当前页面后重试',
        currentSite: '当前网站：{site}', demoSite: '示例页面：{site} 长对话大纲', demoReady: '示例数据：可直接点击、收起目录或切换部分导出',
        demoPurchase: '示例页面不会打开购买链接', proActive: 'Pro 已激活', activating: '激活中…', activationPrompt: '请输入 Pro 授权码', activationFailed: '激活失败：{error}', unknownError: '未知错误',
        partialExport: '部分导出', exitSelection: '退出选择模式', extracting: '正在提取当前对话并生成 {format}', exportingSelected: '正在将选中的问题组导出为 {format}',
        demoFullExport: '示例：将导出 4 组对话', demoSelectedExport: '示例：将导出 {count} 组已选对话', exportFailed: '导出失败：{error}',
        exportedFull: '已导出 {format}：{count} 组对话', exportedSelected: '已导出 {format}：{count} 组选中对话', selectBeforeExport: '请先勾选要导出的对话',
        demoLocated: '示例：已定位「{item}」', located: '已开始定位「{item}」', locateFailed: '暂时无法定位「{item}」', retryLocate: '重试定位', locateRetryTitle: '目标尚未挂载', locateRetryDetail: '目标当前不在页面挂载窗口。可先浏览到相近位置，或重试一次有界定位。', retryingLocate: '正在重试定位「{item}」…', retryLocated: '已定位「{item}」', noOutline: '当前页面未找到可用的大纲内容，请打开你的对话', selectQuestion: '选择此问题组用于局部导出'
    },
    en: {
        welcomeTipAria: 'First-use tip', welcomeTitle: 'Start here', welcomeBody: 'Click an outline item to jump to it. Export the full conversation for free below.',
        openHelp: 'Open help', closeWelcome: 'Dismiss first-use tip', learnPro: 'Learn about Pro', activatePro: 'Activate Pro',
        exportFormat: 'Export format', markdownFree: 'Markdown · Free', htmlPro: 'HTML · Pro', jsonPro: 'JSON · Pro', txtPro: 'TXT · Pro',
        collapseAll: 'Collapse all', expandAll: 'Expand all', exportFull: 'Export full chat', exportFullCount: 'Export full chat ({count} groups)', exportSelected: 'Export selected chats', exporting: 'Exporting…',
        helpTitle: 'Help', closeHelp: 'Close help', quickStartTitle: 'Start here', quickStartBody: 'Open an AI conversation that has finished loading. The extension builds an outline of its questions and answers automatically. Wait for the status line to say the chat is recognized or that the outline is filling in before jumping or exporting.',
        outlineHelpTitle: 'Browse and jump through the outline', outlineHelpOpen: 'Click a question card to expand or collapse its answers. “Collapse all / Expand all” only changes the side-panel reading view; it never changes the original chat.', outlineHelpJump: 'Click a specific outline item to try to locate its matching place in the original page. If a long-chat target is not mounted yet, browse near it normally or use “Retry locating”.',
        longChatTitle: 'Long chats and status', chatgptLoadingHelp: 'ChatGPT first tries to read the complete conversation. While the status says it is reading or filling in the outline, wait a moment: the outline may contain only the content read so far.', doubaoLoadingHelp: 'The extension never scrolls Doubao automatically. Keep browsing the original chat normally and the outline will fill in as its content loads.', statusHelp: 'For a red status message, use “Rescan” to read the current tab again. “!” opens details with only an explanation and a button to copy diagnostics.',
        freeProTitle: 'Export and Pro', freeProBody: '“Export full chat” exports the currently indexed content as Markdown for free. With Pro, select the question groups to keep and export HTML, JSON, or TXT. Changing format never changes the original webpage.',
        privacyTitle: 'Privacy and feedback', privacyBody: 'Conversation content is processed locally in your browser and is not uploaded to our servers. Copied diagnostics are operational metadata only; they contain no chat text, page URL, or account details.', activateLicense: 'Activate license',
        loadingChatgpt: 'Reading the complete conversation…', loadingDoubao: 'Reading the current content; the outline fills in as you scroll', loadingOutline: 'Building conversation outline…',
        analyzing: 'Analyzing page content…',
        emptyOutlineStatus: 'No usable outline is currently available', rescan: 'Rescan', copyDiagnostics: 'Copy diagnostics', copiedDiagnostics: 'Diagnostics copied', copyDiagnosticsFailed: 'Could not copy diagnostics. Try again.', statusDetails: 'View status details and actions', closeStatusDetails: 'Close status details', errorTitle: 'Notice', supportedSites: 'Supported sites:', visitSites: 'Select a site name to open it.', yuanbaoName: 'Yuanbao AI', doubaoName: 'Doubao AI', kimiName: 'Kimi',
        unsupportedPage: 'This page is not a supported AI chat', injectFailed: 'Could not analyze this page. Refresh the tab and try again.',
        currentSite: 'Current site: {site}', demoSite: 'Example: {site} long-chat outline', demoReady: 'Example data: click items, collapse the outline, or switch to partial export',
        demoPurchase: 'The example page does not open the purchase link', proActive: 'Pro is active', activating: 'Activating…', activationPrompt: 'Enter your Pro license code', activationFailed: 'Activation failed: {error}', unknownError: 'Unknown error',
        partialExport: 'Partial export', exitSelection: 'Exit selection', extracting: 'Extracting the current chat as {format}', exportingSelected: 'Exporting selected question groups as {format}',
        demoFullExport: 'Example: 4 question groups will be exported', demoSelectedExport: 'Example: {count} selected question groups will be exported', exportFailed: 'Export failed: {error}',
        exportedFull: 'Exported {format}: {count} question groups', exportedSelected: 'Exported {format}: {count} selected question groups', selectBeforeExport: 'Select at least one chat to export',
        demoLocated: 'Example: jumped to “{item}”', located: 'Locating “{item}”', locateFailed: 'Could not jump to “{item}”.', retryLocate: 'Retry locating', locateRetryTitle: 'Target is not mounted', locateRetryDetail: 'The target is outside the page\'s mounted window. Browse near it first, or retry one bounded location attempt.', retryingLocate: 'Retrying “{item}”…', retryLocated: 'Located “{item}”', noOutline: 'No usable outline was found. Open one of your chats and try again.', selectQuestion: 'Select this question group for partial export'
    }
};
function t(key, values = {}) {
    return (UI_COPY[UI_LANGUAGE][key] || UI_COPY.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
function applyStaticTranslations() {
    document.documentElement.lang = UI_LANGUAGE === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)); });
    document.querySelectorAll('[data-i18n-title]').forEach(node => { node.title = t(node.dataset.i18nTitle); });
}
function getPlatformInfo(url = '') {
    if (url.includes('deepseek.com') || url.includes('deepseek.ai')) return { key: 'deepseek', name: 'DeepSeek' };
    if (url.includes('yuanbao.tencent.com')) return { key: 'yuanbao', name: '元宝 AI' };
    if (url.includes('chatgpt.com')) return { key: 'chatgpt', name: 'ChatGPT' };
    if (url.includes('gemini.google.com')) return { key: 'gemini', name: 'Google Gemini' };
    if (url.includes('grok.com')) return { key: 'grok', name: 'Grok' };
    if (url.includes('doubao.com')) return { key: 'doubao', name: '豆包 AI' };
    if (url.includes('kimi.com') || url.includes('moonshot.cn')) return { key: 'kimi', name: 'Kimi' };
    return { key: 'unsupported', name: UI_LANGUAGE === 'zh' ? '不支持的网站' : 'Unsupported site' };
}

// This deliberately keeps only operational metadata. No URL, conversation text,
// account identifier, or export content enters the diagnostics payload.
function makeRuntimeStatus({ url = '', diagnostics = {}, outline = [], phase = 'result', error = null } = {}) {
    const platform = getPlatformInfo(url);
    const stats = diagnostics.stats || {};
    const questions = Number.isFinite(stats.questions) ? stats.questions : outline.filter(item => item.type === 'question').length;
    const answers = Number.isFinite(stats.answers) ? stats.answers : outline.filter(item => item.type === 'answer').length;
    const conversationDetected = questions > 0 || Number(stats.conversations) > 0 || outline.length > 0;
    const extensionVersion = typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.().version || 'unknown' : 'demo';
    const base = { extensionVersion, platform: platform.name, pageDetected: platform.key !== 'unsupported', conversationDetected, questionsIndexed: questions, answersIndexed: answers, adapter: diagnostics.platform || platform.key, adapterStatus: 'idle', lastScan: new Date().toISOString(), status: 'unknown', errorCode: null };
    if (platform.key === 'unsupported') return { ...base, status: 'unsupported', adapterStatus: 'not-applicable', tone: 'error', title: t('unsupportedPage'), summary: '', detail: UI_LANGUAGE === 'zh' ? '请在支持的 AI 对话页面打开插件。' : 'Open the extension on a supported AI chat page.' };
    if (phase === 'loading') return { ...base, status: 'loading', adapterStatus: 'scanning', title: `${platform.name} · ${UI_LANGUAGE === 'zh' ? '正在读取当前对话' : 'Reading current chat'}`, summary: UI_LANGUAGE === 'zh' ? '正在建立目录和索引…' : 'Building the outline and index…', detail: '' };
    const countSummary = `${questions} ${UI_LANGUAGE === 'zh' ? '个问题 /' : 'questions /'} ${answers} ${UI_LANGUAGE === 'zh' ? '个回答' : 'answers'}`;
    if (error || diagnostics.error) return { ...base, status: 'failed', adapterStatus: 'failed', errorCode: error?.code || 'read-failed', tone: 'error', title: UI_LANGUAGE === 'zh' ? '当前页面暂时无法读取' : 'This page could not be read', summary: `${platform.name} · ${countSummary}`, detail: UI_LANGUAGE === 'zh' ? '页面可能尚未加载完成或网站结构已变化。请重新检测；若仍失败，可复制脱敏诊断信息反馈。' : 'The page may still be loading or its structure may have changed. Rescan, then copy the redacted diagnostics if it persists.' };
    if (diagnostics.pending && !conversationDetected) return { ...base, status: 'loading', adapterStatus: 'loading-complete-chat', title: `${platform.name} · ${UI_LANGUAGE === 'zh' ? '正在读取完整会话' : 'Reading complete chat'}`, summary: UI_LANGUAGE === 'zh' ? '正在建立目录和索引…' : 'Building the outline and index…', detail: '' };
    if (!conversationDetected) return { ...base, status: 'no-conversation', adapterStatus: 'ready-no-conversation', tone: 'error', title: UI_LANGUAGE === 'zh' ? '暂未发现对话内容' : 'No conversation found yet', summary: `${platform.name} · ${countSummary}`, detail: UI_LANGUAGE === 'zh' ? '请确认这是一个已打开的对话；页面加载完成后可重新检测。' : 'Confirm that an opened conversation is on this page, then rescan after it loads.' };
    const partial = platform.key === 'doubao' || diagnostics.pending === true;
    if (partial) return { ...base, status: 'partial', adapterStatus: platform.key === 'doubao' ? 'passive-indexing' : 'loading-complete-chat', tone: 'partial', title: `${platform.name} · ${UI_LANGUAGE === 'zh' ? '目录正在补全' : 'Outline is filling in'}`, summary: countSummary, detail: platform.key === 'doubao' ? (UI_LANGUAGE === 'zh' ? '当前仅显示已加载内容，继续正常浏览对话会自动补全。' : 'Only loaded content is shown. Keep browsing the chat to fill in the outline automatically.') : (UI_LANGUAGE === 'zh' ? '当前显示已读取内容，完整会话仍在读取中。' : 'Loaded content is shown while the complete chat is still being read.') };
    return { ...base, status: 'ready', adapterStatus: 'ready', title: `${platform.name} · ${UI_LANGUAGE === 'zh' ? '当前对话已识别' : 'Current chat recognized'}`, summary: countSummary, detail: UI_LANGUAGE === 'zh' ? '页面已连接，可以浏览目录、定位或导出当前已索引的对话。' : 'The page is connected. Browse the outline, jump to an item, or export the indexed chat.' };
}

function runtimeStatusStorageKey(tabId) {
    return `${RUNTIME_STATUS_KEY_PREFIX}${tabId}`;
}

function clearRetainedRuntimeStatus(tabId) {
    if (!Number.isInteger(tabId) || !chrome.storage?.session?.remove) return;
    chrome.storage.session.remove(runtimeStatusStorageKey(tabId)).catch(() => {});
}

function persistPanelState(tabId = currentTabId) {
    if (!Number.isInteger(tabId) || !chrome.storage?.session?.set) return;
    // This session-local cache belongs to one browser tab. It is cleared when
    // the tab navigates to another route or closes and is never uploaded.
    const retainedState = {
        runtimeStatus,
        outline: currentOutlineData,
        selectionMode,
        selectedQuestionIndexes: Array.from(selectedQuestionIndexes),
        collapsedQuestionKeys: Array.from(collapsedQuestionKeys),
        allCollapsed,
        savedAt: Date.now()
    };
    chrome.storage.session.set({ [runtimeStatusStorageKey(tabId)]: retainedState }).catch(() => {});
}

async function getRetainedPanelState(tabId) {
    if (!Number.isInteger(tabId) || !chrome.storage?.session?.get) return null;
    try {
        const key = runtimeStatusStorageKey(tabId);
        const stored = (await chrome.storage.session.get(key))[key];
        if (!stored) return null;
        // Migrate the status-only shape produced by the previous implementation.
        const retained = stored.runtimeStatus ? stored : { runtimeStatus: stored, outline: [] };
        if (retained.runtimeStatus?.status === 'unsupported') return null;
        return {
            ...retained,
            runtimeStatus: {
                ...retained.runtimeStatus,
                status: 'refreshing',
                adapterStatus: 'refreshing',
                title: `${retained.runtimeStatus.platform} · ${UI_LANGUAGE === 'zh' ? '正在重新检测' : 'Rescanning'}`,
                detail: UI_LANGUAGE === 'zh'
                    ? '已恢复该标签页的目录；正在更新。'
                    : 'This tab\'s outline was restored and is being refreshed.'
            }
        };
    } catch (_) {
        return null;
    }
}

function statusNeedsAttention(status) {
    return ['failed', 'no-conversation', 'unsupported', 'partial', 'locate-needed'].includes(status?.status);
}

function runtimeStatusText(status) {
    if (status?.status === 'ready') return status.summary || '';
    return [status?.title, status?.summary].filter(Boolean).join(' · ');
}

function renderStatusLine(text, tone = 'neutral', { attention = false } = {}) {
    const container = document.getElementById('runtime-status');
    if (!container) return;
    container.hidden = false;
    container.dataset.tone = tone;
    document.getElementById('runtime-status-text').textContent = text;
    const detailsButton = document.getElementById('runtime-status-details-button');
    if (detailsButton) {
        detailsButton.hidden = !attention;
        detailsButton.setAttribute('aria-expanded', 'false');
        detailsButton.setAttribute('aria-label', t('statusDetails'));
        detailsButton.title = t('statusDetails');
    }
}

function renderRuntimeStatusPopover(nextStatus) {
    const popover = document.getElementById('runtime-status-popover');
    if (!popover) return;
    popover.dataset.tone = nextStatus.tone || 'neutral';
    document.getElementById('runtime-status-popover-detail').textContent = nextStatus.detail;
    const copy = document.getElementById('copy-diagnostics-button');
    if (copy) {
        copy.setAttribute('aria-label', t('copyDiagnostics'));
        copy.title = t('copyDiagnostics');
    }
}

function setRuntimeRecoveryActions({ rescan = false, retry = false } = {}) {
    const rescanButton = document.getElementById('rescan-button');
    const retryButton = document.getElementById('retry-locate-button');
    if (rescanButton) {
        rescanButton.hidden = !rescan;
        rescanButton.setAttribute('aria-label', t('rescan'));
        rescanButton.title = t('rescan');
    }
    if (retryButton) {
        retryButton.hidden = !retry;
        retryButton.setAttribute('aria-label', t('retryLocate'));
        retryButton.title = t('retryLocate');
    }
}

function renderRuntimeStatus(nextStatus, { persist = true } = {}) {
    if (transientStatusTimer) clearTimeout(transientStatusTimer);
    transientStatusTimer = null;
    runtimeStatus = nextStatus;
    renderStatusLine(runtimeStatusText(nextStatus), nextStatus.tone || 'neutral', { attention: statusNeedsAttention(nextStatus) });
    renderRuntimeStatusPopover(nextStatus);
    setRuntimeRecoveryActions({
        rescan: statusNeedsAttention(nextStatus) && nextStatus.status !== 'unsupported'
    });
    if (persist) persistPanelState();
}

function diagnosticText(status = runtimeStatus) {
    const safe = status || makeRuntimeStatus();
    return [`AI Chat Exporter ${safe.extensionVersion}`, `Platform: ${safe.platform}`, `Page detected: ${safe.pageDetected}`, `Conversation detected: ${safe.conversationDetected}`, `Questions indexed: ${safe.questionsIndexed}`, `Answers indexed: ${safe.answersIndexed}`, `Adapter: ${safe.adapter}`, `Adapter status: ${safe.adapterStatus}`, `Last scan: ${safe.lastScan}`, `Status: ${safe.status}`, `Error code: ${safe.errorCode || 'none'}`].join('\n');
}

function initializeRuntimeStatusControls() {
    document.getElementById('rescan-button')?.addEventListener('click', requestCurrentTabOutline);
    document.getElementById('copy-diagnostics-button')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(diagnosticText()); setExportStatus(t('copiedDiagnostics'), 'success'); }
        catch (_) { setExportStatus(t('copyDiagnosticsFailed'), 'error'); }
    });
    document.getElementById('retry-locate-button')?.addEventListener('click', retryLocateTarget);
    const detailsButton = document.getElementById('runtime-status-details-button');
    const popover = document.getElementById('runtime-status-popover');
    const closePopover = ({ restoreFocus = false } = {}) => {
        if (!popover) return;
        popover.hidden = true;
        detailsButton?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) detailsButton?.focus();
    };
    detailsButton?.addEventListener('click', () => {
        if (!runtimeStatus || !statusNeedsAttention(runtimeStatus) || !popover) return;
        popover.hidden = false;
        detailsButton.setAttribute('aria-expanded', 'true');
    });
    popover?.addEventListener('click', event => {
        if (event.target === popover) closePopover({ restoreFocus: true });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && popover && !popover.hidden) closePopover({ restoreFocus: true });
    });
}

function setLocateRetryAction(visible = false) {
    setRuntimeRecoveryActions({
        rescan: statusNeedsAttention(runtimeStatus) && runtimeStatus?.status !== 'unsupported',
        retry: visible
    });
}

function showLocateRetryCard(item, { detail = t('locateRetryDetail'), tone = 'error', retry = true } = {}) {
    renderRuntimeStatus({
        ...(runtimeStatus || makeRuntimeStatus({ url: currentTabUrl })),
        status: 'locate-needed',
        adapterStatus: 'locate-needed',
        tone,
        title: t('locateRetryTitle'),
        summary: item?.text || '',
        detail
    });
    setLocateRetryAction(retry);
}

function retryLocateTarget() {
    const item = locateRetryTarget;
    if (!item || !HAS_CHROME_API) return;
    scrollToOutlineItem(item);
    showLocateRetryCard(item, { detail: t('retryingLocate', { item: item.text }), tone: 'partial', retry: false });
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

function setOutlineLoadStatus(url = '', { retained = false } = {}) {
    if (!retained) renderRuntimeStatus(makeRuntimeStatus({ url, phase: 'loading' }), { persist: false });
    if (url.includes('chatgpt.com')) {
        setExportStatus(t('loadingChatgpt'), 'neutral');
    } else if (url.includes('doubao.com')) {
        setExportStatus(t('loadingDoubao'), 'neutral');
    } else {
        setExportStatus(t('loadingOutline'), 'neutral');
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
    activeContentTabId = null;
    if (!port) return;
    try { port.disconnect(); } catch (_) {}
}

function connectContentLifecycle(tabId) {
    if (activeContentPort && activeContentTabId === tabId) return activeContentPort;
    disconnectActiveContentPort();
    if (!chrome.tabs.connect) return;
    const port = chrome.tabs.connect(tabId, { name: 'ai-chat-exporter-panel' });
    activeContentPort = port;
    activeContentTabId = tabId;
    port.onDisconnect.addListener(() => {
        if (activeContentPort === port) {
            activeContentPort = null;
            activeContentTabId = null;
        }
    });
    return port;
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
    locateRetryTarget = null;
    setLocateRetryAction(false);
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

async function getBoundPanelTab() {
    if (Number.isInteger(currentTabId)) return chrome.tabs.get(currentTabId);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

function restorePanelState(retainedState) {
    if (!retainedState) return false;
    selectionMode = retainedState.selectionMode === true;
    selectedQuestionIndexes.clear();
    (retainedState.selectedQuestionIndexes || []).forEach(index => selectedQuestionIndexes.add(index));
    collapsedQuestionKeys.clear();
    (retainedState.collapsedQuestionKeys || []).forEach(key => collapsedQuestionKeys.add(key));
    allCollapsed = retainedState.allCollapsed === true;
    const retainedOutline = Array.isArray(retainedState.outline) ? retainedState.outline : [];
    if (retainedOutline.length > 0) displayOutline(retainedOutline);
    if (retainedState.runtimeStatus) renderRuntimeStatus(retainedState.runtimeStatus, { persist: false });
    updateToggleAllButton();
    updatePanelState();
    return retainedOutline.length > 0 || Boolean(retainedState.runtimeStatus);
}

// Each native panel instance binds once to the tab that created it. It never
// follows chrome's globally active tab after that initial binding.
async function requestCurrentTabOutline() {
    if (DEMO_MODE || !HAS_CHROME_API) return;
    if (tabReloadTimer) clearTimeout(tabReloadTimer);
    tabReloadTimer = null;
    const requestSerial = ++outlineRequestSerial;
    const requestToken = `${Date.now()}:${requestSerial}:${Math.random().toString(36).slice(2)}`;
    currentOutlineRequestToken = requestToken;
    try {
        const tab = await getBoundPanelTab();
        if (!tab || requestSerial !== outlineRequestSerial || requestToken !== currentOutlineRequestToken) return;
        if (Number.isInteger(currentTabId) && currentTabId !== tab.id) return;
        currentTabId = tab.id;
        currentTabUrl = tab.url || '';

        let retained = currentOutlineData.length > 0;
        if (!retained) retained = restorePanelState(await getRetainedPanelState(currentTabId));
        const outlineContainer = document.getElementById('outline');
        if (!retained) clearOutlineForRequest();
        setOutlineLoadStatus(currentTabUrl, { retained });

        if (!isSupportedUrl(currentTabUrl)) {
            renderRuntimeStatus(makeRuntimeStatus({ url: currentTabUrl }));
            showErrorMessage(outlineContainer, t('unsupportedPage'));
            return;
        }
        await injectCurrentContentScripts(currentTabId, currentTabUrl);
        if (requestSerial !== outlineRequestSerial || requestToken !== currentOutlineRequestToken) return;
        connectContentLifecycle(currentTabId);
        await chrome.tabs.sendMessage(currentTabId, { type: 'getOutline', requestToken, url: currentTabUrl });
    } catch (err) {
        const outlineContainer = document.getElementById('outline');
        renderRuntimeStatus(makeRuntimeStatus({ url: currentTabUrl, error: { code: 'injection-failed' } }));
        showErrorMessage(outlineContainer, t('injectFailed'), { error: err.message });
    }
}

// 侧边栏加载时请求大纲
window.addEventListener('load', () => {
    applyStaticTranslations();
    // 初始化一键操作按钮
    initializeToggleAllButton();
    initializePanelActionControls();
    initializeHelpControls();
    initializeRuntimeStatusControls();
    initializeWelcomeTip();
    if (DEMO_MODE) {
        renderLicenseStatus({ active: true, plan: 'demo' });
        displayOutline(DEMO_OUTLINE);
        currentTabUrl = DEMO_PLATFORM === 'doubao'
            ? 'https://www.doubao.com/chat/demo'
            : 'https://chatgpt.com/c/demo';
        renderRuntimeStatus(makeRuntimeStatus({
            url: currentTabUrl,
            diagnostics: { platform: DEMO_PLATFORM.toUpperCase(), stats: { questions: 4, answers: 9 } },
            outline: DEMO_OUTLINE
        }), { persist: false });
        return;
    }
    requestCurrentTabOutline();
    refreshLicenseStatus();
});

// A tab-specific panel only reacts to updates from its owning tab.
if (HAS_CHROME_API) {
    chrome.tabs.onUpdated && chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tabId !== currentTabId) return;
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
        clearRetainedRuntimeStatus(currentTabId);
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
        const url = sender.tab && sender.tab.url ? sender.tab.url : '';
        renderRuntimeStatus(makeRuntimeStatus({ url, diagnostics: message.diagnostics, outline: message.outline }));
        if (!Array.isArray(message.outline) || message.outline.length === 0) {
            if (!message.diagnostics?.pending) {
                setExportStatus(t('emptyOutlineStatus'), 'neutral');
            }
        }
        setLocateRetryAction(false);
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
    if (transientStatusTimer) clearTimeout(transientStatusTimer);
    renderStatusLine(message, tone, { attention: statusNeedsAttention(runtimeStatus) });
    // Operation feedback replaces the one-line session summary briefly, then returns
    // to the current session state. Detailed recovery stays behind the ! button.
    transientStatusTimer = setTimeout(() => {
        transientStatusTimer = null;
        if (runtimeStatus) renderRuntimeStatus(runtimeStatus, { persist: false });
    }, tone === 'error' ? 5200 : 3200);
    transientStatusTimer?.unref?.();
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
            persistPanelState();
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

        const questionGroupCount = currentOutlineData.filter(item => item?.type === 'question').length;
        bottomExportButton.textContent = selectionMode
            ? t('exportSelected')
            : questionGroupCount > 0
                ? t('exportFullCount', { count: questionGroupCount })
                : t('exportFull');
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

    const jumpTabId = currentTabId;
    const jumpUrl = currentTabUrl;
    const jumpRequestToken = currentOutlineRequestToken;
    const jumpSerial = ++jumpRequestSerial;
    const isRetry = locateRetryTarget === item;
    setLocateRetryAction(false);
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0] || tabs[0].id !== jumpTabId || tabs[0].url !== jumpUrl) return;
        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'scrollTo',
            elementId: item.id,
            metadata: item.metadata,
            url: jumpUrl,
            requestToken: jumpRequestToken
        }, response => {
            if (jumpSerial !== jumpRequestSerial || jumpTabId !== currentTabId || jumpUrl !== currentTabUrl || jumpRequestToken !== currentOutlineRequestToken) return;
            if (chrome.runtime.lastError || !response?.success) {
                const isChatGpt = jumpUrl.includes('chatgpt.com');
                if (!chrome.runtime.lastError && isChatGpt && response?.reason === 'target-not-mounted') {
                    locateRetryTarget = item;
                    showLocateRetryCard(item);
                } else {
                    setExportStatus(t('locateFailed', { item: item.text }), 'error');
                }
                return;
            }
            locateRetryTarget = null;
            setLocateRetryAction(false);
            if (isRetry) {
                renderRuntimeStatus({
                    ...(runtimeStatus || makeRuntimeStatus({ url: currentTabUrl })),
                    status: 'ready',
                    adapterStatus: 'ready',
                    tone: 'neutral',
                    title: t('retryLocated', { item: item.text }),
                    summary: '',
                    detail: ''
                });
            }
            setExportStatus(t('located', { item: item.text }), 'neutral');
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
        persistPanelState();
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
        persistPanelState();
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
    persistPanelState();
}

// 添加错误消息显示函数
function showErrorMessage(container, message, diagnostics) {
    container.innerHTML = `
        <div class="error-message">
            <h3>${t('errorTitle')}</h3>
            <p>${message}</p>
            <div style="margin-top: 15px;">
                <p>${t('supportedSites')}</p>
                <ul style="margin-top: 8px; padding-left: 20px;">
                    <li>
                        <a href="https://chat.deepseek.com/" target="_blank">
                            DeepSeek Chat
                        </a>
                    </li>
                    <li>
                        <a href="https://yuanbao.tencent.com/" target="_blank">
                            ${t('yuanbaoName')}
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
                            ${t('doubaoName')}
                        </a>
                    </li>
                    <li>
                        <a href="https://kimi.moonshot.cn/" target="_blank">
                            ${t('kimiName')}
                        </a>
                    </li>
                </ul>
            </div>
            <p style="margin-top: 15px; font-size: 12px; color: var(--text-tertiary);">
                ${t('visitSites')}
            </p>
        </div>
    `;
} 
