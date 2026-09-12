import { getPlatformConfig } from '../export/config/selectors.js';
import { authorizeExport, generateExport } from '../export/utils/export-generators.js';
import { downloadManager } from '../export/utils/download-manager.js';
import { sanitizeFilename } from '../export/utils/sanitizer.js';
import { activateLicense, canUse, getLicenseStatus } from './license.js';

// 注册侧面板
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const SUPPORTED_URL_SNIPPETS = [
    "deepseek.com",
    "deepseek.ai",
    "yuanbao.tencent.com",
    "chatgpt.com",
    "doubao.com",
    "gemini.google.com",
    "grok.com",
    "kimi.com",
    "moonshot.cn"
];
const tabExtractionLocks = new Map();
const RUNTIME_STATUS_KEY_PREFIX = 'aiChatExporterRuntimeStatus:';

function isSupportedUrl(url = '') {
    return SUPPORTED_URL_SNIPPETS.some(snippet => url.includes(snippet));
}

// The panel is available only for the current supported tab. This avoids a
// global side-panel toggle leaking into unrelated tabs.
async function syncSidePanelAvailability(tab) {
    if (!tab?.id) return;
    const supported = isSupportedUrl(tab.url || '');
    try {
        await Promise.all([
            chrome.sidePanel.setOptions({
                tabId: tab.id,
                path: 'src/core/sidepanel.html',
                enabled: supported
            }),
            // An action popup takes precedence over openPanelOnActionClick.
            // This gives unsupported tabs a useful response without exposing
            // the outline side panel outside supported AI chat sites.
            chrome.action.setPopup({
                tabId: tab.id,
                popup: supported ? '' : 'src/core/unsupported-popup.html'
            }),
            chrome.action.setTitle({
                tabId: tab.id,
                title: supported
                    ? 'AI Chat Exporter：打开对话大纲'
                    : 'AI Chat Exporter：请在支持的 AI 对话页面使用'
            })
        ]);
    } catch (error) {
        // Chrome rejects protected/internal pages. The UI has an unsupported
        // state as a fallback when it is already open during navigation.
        console.debug('AI Chat Exporter: could not update side panel availability', error);
    }
}

function clearRetainedRuntimeStatus(tabId) {
    return chrome.storage.session.remove(`${RUNTIME_STATUS_KEY_PREFIX}${tabId}`).catch(() => {});
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try { await syncSidePanelAvailability(await chrome.tabs.get(tabId)); } catch (_) {}
});
chrome.tabs.onCreated.addListener(tab => { syncSidePanelAvailability(tab); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) clearRetainedRuntimeStatus(tabId);
    if (changeInfo.url || changeInfo.status === 'loading') {
        syncSidePanelAvailability({ ...tab, id: tabId });
    }
});
chrome.tabs.onRemoved.addListener(tabId => { clearRetainedRuntimeStatus(tabId); });

async function initializeSidePanels() {
    // Prevent tabs without explicit options from falling back to the manifest's
    // global panel. Supported tabs receive their own tab-specific instance below.
    await chrome.sidePanel.setOptions({ enabled: false });
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(syncSidePanelAvailability));
}

initializeSidePanels().catch(error => {
    console.debug('AI Chat Exporter: could not initialize side panels', error);
});

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        throw new Error('无法找到当前标签页');
    }
    return tab;
}

async function withTabExtractionLock(tabId, operation) {
    const previous = tabExtractionLocks.get(tabId) || Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const current = previous.catch(() => {}).then(() => gate);
    tabExtractionLocks.set(tabId, current);

    await previous.catch(() => {});
    try {
        return await operation();
    } finally {
        release();
        if (tabExtractionLocks.get(tabId) === current) tabExtractionLocks.delete(tabId);
    }
}

async function extractCurrentChatData() {
    const tab = await getActiveTab();

    return withTabExtractionLock(tab.id, () => extractTabChatData(tab));
}

async function extractTabChatData(tab) {

    if (!isSupportedUrl(tab.url || '')) {
        throw new Error('当前页面不是支持的 AI 对话页面');
    }

    const platformConfig = getPlatformConfig(tab.url);
    if (!platformConfig) {
        throw new Error('无法识别当前 AI 平台');
    }

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
            'src/export/lib/turndown.js',
            'src/export/lib/turndown-plugin-gfm.js',
            'src/core/conversation-index.js'
        ]
    });

    if (platformConfig.key === 'chatgpt') {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            files: ['src/core/chatgpt-api-bridge.js']
        });
    }

    // ChatGPT 使用会话 API；豆包只记录用户滚动时挂载的 data-message-id。
    // 导出不得主动移动用户页面。
    if (platformConfig.key === 'chatgpt' || platformConfig.key === 'doubao') {
        const [indexedResult] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
                const index = window.AI_CHAT_CONVERSATION_INDEX;
                if (!index) return null;
                const retainedByPanel = window.__AI_CHAT_EXPORTER_PANEL_ACTIVE__ === true;
                // 导出只做一次快照，不创建豆包 MutationObserver/scroll listener。
                try {
                    await index.refresh({ force: true, observe: false });
                    return index.toUnifiedData();
                } finally {
                    // 导出独立运行时连 window message listener 也不常驻；侧栏正在使用则保留其索引。
                    if (!retainedByPanel) index.disconnect();
                }
            }
        });
        if (indexedResult?.result?.conversations?.length) {
            return addConversationIndexes(indexedResult.result, tab.url, platformConfig.name);
        }
    }

    const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (url) => {
            const moduleUrl = chrome.runtime.getURL('src/export/config/selectors.js');
            const { extractUnifiedData } = await import(moduleUrl);
            return extractUnifiedData(url);
        },
        args: [tab.url]
    });

    if (!result || !result.result) {
        throw new Error('无法提取当前对话内容');
    }

    const unifiedData = result.result;
    unifiedData.url = tab.url;
    unifiedData.platform = platformConfig.name;

    if (!unifiedData.conversations || unifiedData.conversations.length === 0) {
        throw new Error(`未找到 ${platformConfig.name} 对话内容，请确认当前页面是对话页`);
    }

    return addConversationIndexes(unifiedData, tab.url, platformConfig.name);
}

function addConversationIndexes(unifiedData, url, platform) {
    unifiedData.url = url;
    unifiedData.platform = platform;
    unifiedData.conversations = unifiedData.conversations.map((conversation, index) => ({
        ...conversation,
        conversationId: `conversation-${index}`,
        questionIndex: index,
        answerIndex: index
    }));
    return unifiedData;
}

async function assertExportAccess(format, { selected = false } = {}) {
    return authorizeExport(format, { selected, canUse });
}

function downloadExport(unifiedData, format) {
    const generated = generateExport(unifiedData, format);
    const filename = sanitizeFilename(unifiedData.title);
    downloadManager.download(generated.content, filename, generated);
    return generated;
}

async function handleExportFullChat(format = 'markdown') {
    const normalizedFormat = await assertExportAccess(format);
    const unifiedData = await extractCurrentChatData();
    const generated = downloadExport(unifiedData, normalizedFormat);

    return {
        platform: unifiedData.platform,
        count: unifiedData.conversations.length,
        rangeLabel: getConversationRangeLabel(unifiedData.conversations),
        passiveIndex: !!unifiedData.passiveIndex,
        format: generated.format,
        formatLabel: generated.label
    };
}

async function handleExportSelectedChat(questionIndexes = [], format = 'markdown') {
    const normalizedFormat = await assertExportAccess(format, { selected: true });

    const selectedIndexes = Array.from(new Set(
        questionIndexes
            .map(index => Number(index))
            .filter(index => Number.isInteger(index) && index >= 0)
    )).sort((a, b) => a - b);

    if (selectedIndexes.length === 0) {
        throw new Error('请先勾选要导出的对话');
    }

    const unifiedData = await extractCurrentChatData();
    const selectedSet = new Set(selectedIndexes);
    const conversations = unifiedData.conversations.filter((conversation, index) => {
        const questionIndex = Number.isInteger(conversation.questionIndex)
            ? conversation.questionIndex
            : index;
        return selectedSet.has(questionIndex);
    });

    if (conversations.length === 0) {
        throw new Error('未找到勾选的对话内容，请刷新页面后重试');
    }

    const selectedData = {
        ...unifiedData,
        title: `${unifiedData.title}-selected`,
        conversations
    };

    const generated = downloadExport(selectedData, normalizedFormat);

    return {
        platform: unifiedData.platform,
        count: conversations.length,
        rangeLabel: getConversationRangeLabel(conversations),
        passiveIndex: !!unifiedData.passiveIndex,
        format: generated.format,
        formatLabel: generated.label
    };
}

function getConversationRangeLabel(conversations = []) {
    if (conversations.length === 0) return '问题 0 到问题 0';
    const indexes = conversations
        .map((conversation, index) => Number.isInteger(conversation.questionIndex) ? conversation.questionIndex : index)
        .sort((a, b) => a - b);
    return `问题 ${indexes[0] + 1} 到问题 ${indexes[indexes.length - 1] + 1}`;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'exportFullChat') {
        handleExportFullChat(request.format || 'markdown')
            .then(result => sendResponse({ success: true, ...result }))
            .catch(error => {
                console.error('AI Chat Export Pro export failed:', error);
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'public/assets/icon48.png',
                    title: '导出失败',
                    message: error.message
                });
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (request && request.action === 'exportSelectedChat') {
        handleExportSelectedChat(request.questionIndexes || [], request.format || 'markdown')
            .then(result => sendResponse({ success: true, ...result }))
            .catch(error => {
                console.error('AI Chat Export Pro selected export failed:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (request && request.action === 'getLicenseStatus') {
        getLicenseStatus()
            .then(status => sendResponse({ success: true, status }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request && request.action === 'activateLicense') {
        activateLicense(request.code || '')
            .then(status => sendResponse({ success: true, status }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// 页面分析脚本只由侧栏打开或用户主动导出时注入。
// 不在安装、页面更新或标签切换时后台常驻扫描。

// 处理快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
    if (!['toggle_outline', 'next_heading', 'prev_heading'].includes(command)) return;
    const tab = await getActiveTab();
    if (!isSupportedUrl(tab.url || '')) return;

    // 快捷键同样按需打开侧栏，由侧栏建立 Port 后再注入分析脚本。
    // 这样从未打开过扩展的标签页也可工作，同时不会留下无主 observer。
    await syncSidePanelAvailability(tab);
    await chrome.sidePanel.open({ tabId: tab.id });
    if (command === 'toggle_outline') return;
    setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: command }).catch(() => {});
    }, 600);
}); 
