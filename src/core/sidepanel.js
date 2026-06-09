// 当前激活标签页ID
let currentTabId = null;

// 全局状态：是否所有目录都已收起
let allCollapsed = false;
let selectionMode = false;
let currentOutlineData = [];
let licenseStatusState = { active: false, plan: 'free' };
let exportInProgress = false;
const selectedQuestionIndexes = new Set();
const PURCHASE_URL = 'https://wj.qq.com/s2/26957751/9rvt/';

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
    'src/core/pipeline.js',
    'src/core/content.js'
];

function isSupportedUrl(url = '') {
    return SUPPORTED_URL_SNIPPETS.some(snippet => url.includes(snippet));
}

async function injectCurrentContentScripts(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES
    });
}

// 主动请求当前标签页大纲
function requestCurrentTabOutline() {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (tabs[0]) {
            currentTabId = tabs[0].id;
            // 清空大纲显示，防止串台
            const outlineContainer = document.getElementById('outline');
            if (outlineContainer) outlineContainer.innerHTML = '<div class="loading-state"><p>正在分析页面内容...</p></div>';

            try {
                if (isSupportedUrl(tabs[0].url)) {
                    await injectCurrentContentScripts(currentTabId);
                }
                chrome.tabs.sendMessage(currentTabId, {type: 'getOutline'});
            } catch (err) {
                showErrorMessage(outlineContainer, '无法注入页面分析脚本，请刷新当前页面后重试', {
                    error: err.message
                });
            }
        }
    });
}

// 侧边栏加载时请求大纲
window.addEventListener('load', () => {
    requestCurrentTabOutline();
    // 初始化一键操作按钮
    initializeToggleAllButton();
    initializePanelActionControls();
    refreshLicenseStatus();
});

// 监听标签切换
chrome.tabs.onActivated && chrome.tabs.onActivated.addListener(requestCurrentTabOutline);
chrome.tabs.onUpdated && chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.status === 'complete') {
        requestCurrentTabOutline();
    }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 只处理当前激活标签页返回的消息
    if (sender.tab && sender.tab.id !== currentTabId) return;
    if (message.type === 'outline') {
        displayOutline(message.outline, message.diagnostics);
        // 显示网站类型
        const url = sender.tab && sender.tab.url ? sender.tab.url : '';
        const siteInfo = document.getElementById('site-info');
        if (siteInfo) {
            if (url.includes('deepseek.com')) {
                siteInfo.textContent = '当前网站: DeepSeek Chat';
            } else if (url.includes('yuanbao.tencent.com')) {
                siteInfo.textContent = '当前网站: 元宝 AI';
            } else if (url.includes('chatgpt.com')) {
                siteInfo.textContent = '当前网站: ChatGPT';
            } else if (url.includes('gemini.google.com')) {
                siteInfo.textContent = '当前网站: Google Gemini';
            } else if (url.includes('grok.com')) {
                siteInfo.textContent = '当前网站: Grok';
            } else if (url.includes('doubao.com')) {
                siteInfo.textContent = '当前网站: 豆包 AI';
            } else if (url.includes('kimi.com') || url.includes('kimi.moonshot.cn')) {
                siteInfo.textContent = '当前网站: Kimi 智能助手';
            } else {
                siteInfo.textContent = '当前网站: 普通网页';
            }
        }
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

function initializePanelActionControls() {
    const purchaseButton = document.getElementById('pro-purchase-action');
    const proActionButton = document.getElementById('pro-mode-action');
    const bottomExportButton = document.getElementById('bottom-export-btn');

    if (purchaseButton) {
        purchaseButton.addEventListener('click', () => {
            chrome.tabs.create({ url: PURCHASE_URL });
        });
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

    updatePanelState();
}

function refreshLicenseStatus() {
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
    const code = window.prompt('请输入 Pro 授权码');
    if (!code) return;

    triggerButton.disabled = true;
    triggerButton.textContent = '激活中...';
    chrome.runtime.sendMessage({ action: 'activateLicense', code }, (response) => {
        triggerButton.disabled = false;

        if (chrome.runtime.lastError) {
            setExportStatus(`激活失败：${chrome.runtime.lastError.message}`, 'error');
            refreshLicenseStatus();
            return;
        }

        if (!response || !response.success) {
            setExportStatus(`激活失败：${response?.error || '未知错误'}`, 'error');
            refreshLicenseStatus();
            return;
        }

        setExportStatus('Pro 已激活', 'success');
        renderLicenseStatus(response.status);
    });
}

function updatePanelState() {
    const proLabel = document.getElementById('pro-mode-label');
    const purchaseButton = document.getElementById('pro-purchase-action');
    const proActionButton = document.getElementById('pro-mode-action');
    const bottomExportButton = document.getElementById('bottom-export-btn');
    const selectedCount = selectedQuestionIndexes.size;
    const isPro = Boolean(licenseStatusState.active);

    if (proLabel) {
        proLabel.textContent = isPro ? 'Pro用户' : 'Pro用户可选择部分导出';
    }

    if (purchaseButton) {
        purchaseButton.hidden = isPro;
        purchaseButton.disabled = exportInProgress;
    }

    if (proActionButton) {
        proActionButton.disabled = exportInProgress;
        proActionButton.classList.remove('activate', 'partial', 'exit');
        if (!isPro) {
            proActionButton.textContent = '激活Pro';
            proActionButton.classList.add('activate');
        } else if (selectionMode) {
            proActionButton.textContent = '退出选择模式';
            proActionButton.classList.add('exit');
        } else {
            proActionButton.textContent = '部分导出';
            proActionButton.classList.add('partial');
        }
    }

    if (bottomExportButton) {
        if (exportInProgress) {
            bottomExportButton.disabled = true;
            bottomExportButton.textContent = '导出中...';
            return;
        }

        bottomExportButton.textContent = selectionMode ? '导出已选对话' : '导出完整对话';
        bottomExportButton.disabled = selectionMode && selectedCount === 0;
    }
}

function exportFullChat() {
    const bottomExportButton = document.getElementById('bottom-export-btn');
    if (!bottomExportButton || exportInProgress) return;

    exportInProgress = true;
    updatePanelState();
    setExportStatus('正在提取当前对话并生成 Markdown');

    chrome.runtime.sendMessage({ action: 'exportFullChat' }, (response) => {
        exportInProgress = false;
        updatePanelState();

        if (chrome.runtime.lastError) {
            setExportStatus(`导出失败：${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (!response || !response.success) {
            setExportStatus(`导出失败：${response?.error || '未知错误'}`, 'error');
            return;
        }

        setExportStatus(`已导出 ${response.platform || '当前平台'} 的 ${response.count || 0} 组对话`, 'success');
    });
}

function exportSelectedChat() {
    if (exportInProgress) return;

    const questionIndexes = Array.from(selectedQuestionIndexes).sort((a, b) => a - b);
    if (questionIndexes.length === 0) {
        setExportStatus('请先勾选要导出的对话', 'error');
        updatePanelState();
        return;
    }

    exportInProgress = true;
    updatePanelState();
    setExportStatus('正在导出选中的问题组');

    chrome.runtime.sendMessage({ action: 'exportSelectedChat', questionIndexes }, (response) => {
        exportInProgress = false;
        updatePanelState();

        if (chrome.runtime.lastError) {
            setExportStatus(`导出失败：${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (!response || !response.success) {
            setExportStatus(`导出失败：${response?.error || '未知错误'}`, 'error');
            return;
        }

        setExportStatus(`已导出 ${response.count || 0} 组选中对话`, 'success');
    });
}

function renderCurrentOutline() {
    if (currentOutlineData.length > 0) {
        displayOutline(currentOutlineData);
    }
}

// 显示大纲
function displayOutline(outlineData, diagnostics) {
    const outlineContainer = document.getElementById('outline');
    currentOutlineData = Array.isArray(outlineData) ? outlineData : [];
    
    // 检查是否有大纲数据
    if (!outlineData || outlineData.length === 0) {
        selectedQuestionIndexes.clear();
        updatePanelState();
        showErrorMessage(outlineContainer, '当前页面未找到可用的大纲内容，请打开你的对话', diagnostics);
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

        itemDiv.addEventListener('click', () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'scrollTo',
                    elementId: item.id,
                    metadata: item.metadata
                });
            });
        });

        container.appendChild(itemDiv);
    });
}

// 渲染问题组（问题及其答案）
function renderQuestionGroup(question, answers, container) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'question-group';

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
    toggle.className = 'toggle-icon expanded';  // 默认展开
    questionDiv.appendChild(toggle);

    const questionIndex = getQuestionIndex(question);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = `selection-checkbox${selectionMode ? '' : ' hidden'}`;
    checkbox.checked = questionIndex !== null && selectedQuestionIndexes.has(questionIndex);
    checkbox.setAttribute('aria-label', '选择此问题组用于局部导出');
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
    text.textContent = question.text;
    questionDiv.appendChild(text);

    // 创建答案容器
    const answersDiv = document.createElement('div');
    answersDiv.className = 'answers-container';
    // 移除初始 display 设置，由 CSS max-height 控制

    // 添加问题点击事件（跳转）
    questionDiv.addEventListener('click', (e) => {
        if (e.target !== toggle && !e.target.closest('.toggle-icon')) {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'scrollTo',
                    elementId: question.id,
                    metadata: question.metadata
                });
            });
        }
    });

    // 添加展开/收起功能
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = toggle.classList.contains('expanded');
        toggle.classList.toggle('expanded', !isExpanded);
        toggle.classList.toggle('collapsed', isExpanded);

        if (isExpanded) {
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
        answerDiv.addEventListener('click', () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'scrollTo',
                    elementId: answer.id,
                    metadata: answer.metadata
                });
            });
        });

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
    const toggleAllBtn = document.getElementById('toggle-all-btn');

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
    if (toggleAllBtn) {
        const icon = toggleAllBtn.querySelector('.icon');
        const text = toggleAllBtn.querySelector('.text');

        if (allCollapsed) {
            toggleAllBtn.classList.add('collapsed');
            icon.textContent = '▶';
            text.textContent = '展开所有';
        } else {
            toggleAllBtn.classList.remove('collapsed');
            icon.textContent = '▼';
            text.textContent = '收起所有';
        }
    }
}

// 一键收起/展开所有目录
function toggleAllDirectories() {
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    const allToggles = document.querySelectorAll('.toggle-icon');
    const allAnswersContainers = document.querySelectorAll('.answers-container');

    allCollapsed = !allCollapsed;

    // 更新按钮状态
    if (toggleAllBtn) {
        const icon = toggleAllBtn.querySelector('.icon');
        const text = toggleAllBtn.querySelector('.text');

        if (allCollapsed) {
            toggleAllBtn.classList.add('collapsed');
            icon.textContent = '▶';
            text.textContent = '展开所有';
        } else {
            toggleAllBtn.classList.remove('collapsed');
            icon.textContent = '▼';
            text.textContent = '收起所有';
        }
    }

    // 更新所有目录状态 - 使用 height 动画
    allToggles.forEach((toggle, index) => {
        const answersContainer = allAnswersContainers[index];
        if (!answersContainer) return;

        if (allCollapsed) {
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
