import { getPlatformConfig } from '../export/config/selectors.js';
import { markdownGenerator } from '../export/utils/markdown-generator.js';
import { downloadManager } from '../export/utils/download-manager.js';
import { sanitizeFilename } from '../export/utils/sanitizer.js';
import { activateLicense, canUse, getLicenseStatus } from './license.js';

// 注册侧面板
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const SUPPORTED_URL_PATTERNS = [
    "*://*.deepseek.com/*",
    "*://*.deepseek.ai/*",
    "*://*.yuanbao.tencent.com/*",
    "*://*.chatgpt.com/*",
    "*://*.doubao.com/*",
    "*://*.gemini.google.com/*",
    "*://*.grok.com/*",
    "*://*.kimi.com/*",
    "*://*.moonshot.cn/*"
];

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

function isSupportedUrl(url = '') {
    return SUPPORTED_URL_SNIPPETS.some(snippet => url.includes(snippet));
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        throw new Error('无法找到当前标签页');
    }
    return tab;
}

async function extractCurrentChatData() {
    const tab = await getActiveTab();

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
            func: async () => {
                const conversationId = location.pathname.match(/\/c\/([^/?#]+)/)?.[1];
                if (!conversationId) return;
                try {
                    const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}?offset=0&limit=100000`, {
                        credentials: 'include'
                    });
                    if (!response.ok) return;
                    window.postMessage({
                        source: 'ai-chat-export-pro',
                        type: 'chatgpt-conversation',
                        payload: await response.json()
                    }, location.origin);
                } catch (error) {
                    console.warn('AI Chat Export Pro: ChatGPT page API bridge failed', error);
                }
            }
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
                await index.refresh();
                return index.toUnifiedData();
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

async function handleExportFullChat() {
    const unifiedData = await extractCurrentChatData();
    const markdown = markdownGenerator.generate(unifiedData);
    const filename = sanitizeFilename(unifiedData.title);
    downloadManager.downloadMarkdown(markdown, filename);

    return {
        platform: unifiedData.platform,
        count: unifiedData.conversations.length,
        rangeLabel: getConversationRangeLabel(unifiedData.conversations),
        passiveIndex: !!unifiedData.passiveIndex
    };
}

async function handleExportSelectedChat(questionIndexes = []) {
    if (!await canUse('selected_markdown_export')) {
        throw new Error('勾选局部导出是 Pro 功能，请先激活授权码');
    }

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

    const markdown = markdownGenerator.generate(selectedData);
    const filename = sanitizeFilename(selectedData.title);
    downloadManager.downloadMarkdown(markdown, filename);

    return {
        platform: unifiedData.platform,
        count: conversations.length,
        rangeLabel: getConversationRangeLabel(conversations),
        passiveIndex: !!unifiedData.passiveIndex
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
        handleExportFullChat()
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
        handleExportSelectedChat(request.questionIndexes || [])
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

// 监听插件安装或更新
chrome.runtime.onInstalled.addListener(async () => {
    // 获取所有匹配的标签页
    const tabs = await chrome.tabs.query({
        url: SUPPORTED_URL_PATTERNS
    });
    
    // 为每个匹配的标签页注入content script
    for (const tab of tabs) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                    'src/config/selectors.js',
                    'src/utils/common.js',
                    'src/core/pipeline.js',
                    'src/core/content.js'
                ]
            });
        } catch (err) {
            console.error(`Failed to inject content script into tab ${tab.id}:`, err);
        }
    }
});

// 当标签页更新时，注入content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const isMatchingUrl = isSupportedUrl(tab.url);
        
        if (isMatchingUrl) {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [
                    'src/config/selectors.js',
                    'src/utils/common.js',
                    'src/core/pipeline.js',
                    'src/core/content.js'
                ]
            });
        }
    }
});

// 添加标签页切换监听器
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const isMatchingUrl = isSupportedUrl(tab.url);
    
    if (isMatchingUrl) {
        // 注入 content script
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [
                    'src/config/selectors.js',
                    'src/utils/common.js',
                    'src/core/pipeline.js',
                    'src/core/content.js'
                ]
        });
        
        // 触发大纲提取
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                if (typeof extractAndSendOutline === 'function') {
                    extractAndSendOutline();
                }
            }
        });
    }
});

// 监听插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    const isMatchingUrl = isSupportedUrl(tab.url);
    
    if (isMatchingUrl) {
        // 注入 content script
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [
                    'src/config/selectors.js',
                    'src/utils/common.js',
                    'src/core/pipeline.js',
                    'src/core/content.js'
                ]
        });
        
        // 触发大纲提取
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                // 手动触发一次大纲提取
                if (typeof extractAndSendOutline === 'function') {
                    extractAndSendOutline();
                }
            }
        });
    }
});

// 处理快捷键命令
chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case 'toggle_outline':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle_outline' });
            });
            break;
        case 'next_heading':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'next_heading' });
            });
            break;
        case 'prev_heading':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'prev_heading' });
            });
            break;
    }
}); 
