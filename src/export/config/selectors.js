/**
 * 平台选择器配置
 * 
 * 【硬性要求】新增平台只需修改本文件 + manifest.json
 * 
 * 每个平台只需定义：
 * - name: 平台名称
 * - urlPatterns: URL匹配规则
 * - selectors: DOM选择器
 * - features: 可选的功能开关
 */

/**
 * DeepSeek 平台配置
 */
const deepseekConfig = {
  name: 'DeepSeek',
  urlPatterns: ['deepseek.com', 'deepseek.ai'],
  selectors: {
    conversation: null,
    title: '.f8d1e4c0',
    question: '._9663006',
    answer: '._4f9bf79._43c05b5',
    thinking: '.ds-think-content, ._74c0879',
    search: '.a6d716f5.db5991dd',
    markdownBlock: '.ds-markdown',
    codeBlock: '.md-code-block',
    codeLanguage: '.md-code-block-infostring'
  },

  // 功能开关
  features: {
    hasThinking: true,
    hasSearch: true,
    hasCodeBlocks: true,
    removeThinkingBeforeContent: true,
    searchKeyword: '网页'
  }
};

/**
 * YuanBao AI 平台配置
 * 
 * DOM 结构更新：2026-05-21
 * 元宝升级到 deepsearch 组件体系，旧 reasoner 组件已废弃。
 * - thinking: .hyc-component-reasoner__think → .hyc-component-deepsearch-cot__think
 * - search: 搜索结果已整合进 thinking 流程，不再有独立 search-list 容器
 * - markdownBlock: .hyc-component-reasoner__text → .hyc-common-markdown
 * - title: header 只显示 bot 名 "元宝"，改用 first question 作为标题
 */
const yuanbaoConfig = {
  name: 'YuanBao AI',
  urlPatterns: ['yuanbao.tencent.com'],
  selectors: {
    conversation: null,
    title: '.agent-dialogue__content--common__header',
    question: '.agent-chat__bubble--human',
    answer: '.agent-chat__bubble--ai',
    thinking: '.hyc-component-deepsearch-cot__think, .hyc-component-reasoner__think',
    search: '', // 搜索结果已整合进 thinking 流程
    markdownBlock: '.hyc-common-markdown', // 新通用 markdown 渲染组件
    codeBlock: '.hyc-common-markdown__code pre.hyc-common-markdown__code-lan',
    codeLanguage: '.hyc-common-markdown__code__hd__l',
    cleanupSelectors: [
      '.hyc-common-markdown__sup',
      'sup',
      '[class*="video"]',
      '[class*="card-box"]',
      '.hyc-component-deepsearch-cot__think__content__item__docs' // 搜索引用列表（已嵌入 thinking）
    ]
  },

  features: {
    hasThinking: true,
    hasSearch: false, // 搜索已整合进 thinking 流程
    hasCodeBlocks: true,
    titleFromFirstQuestion: true, // header 只显示 "元宝"，改用 first question
    searchWithLinks: false
  }
};

/**
 * ChatGPT 平台配置
 */
const chatgptConfig = {
  name: 'ChatGPT',
  urlPatterns: ['chatgpt.com'],
  selectors: {
    conversation: null, // ChatGPT 的 turn 容器按角色拆开，不适合作为成对问答容器
    title: null,
    turn: '[data-turn]',
    question: '[data-turn="user"]',
    answer: '[data-turn="assistant"]',
    thinking: null,
    markdownBlock: '.markdown.prose, .markdown'
  },

  features: {
    hasCodeBlocks: true,
    titleFromFirstQuestion: true,  // 用第一个问题作为标题
    pairByTurns: true
  }
};

/**
 * Doubao 平台配置
 */
const doubaoConfig = {
  name: 'Doubao',
  urlPatterns: ['doubao.com'],
  selectors: {
    conversation: null,
    title: 'div.group\\/title',
    turn: '[class*="inner-item-"], [class*="top-item-"]',
    question: 'div[class*="send-msg-bubble"], div[class*="bg-g-send-msg-bubble-bg"]',
    answer: '.md-box-root, .flow-markdown-body, div[class*="conversation-page-message-host"]',
    thinking: null,
    markdownBlock: '.md-box-root, .flow-markdown-body, div[class*="conversation-page-message-host"]',
    search: '', // 豆包暂无搜索结果独立区块
    cleanupSelectors: [
      'div[class*="send-msg-bubble"]', // 去掉嵌在回答宿主中的提问气泡
      'div[class*="message-action-bar"]',
      'div[class*="entry-btn-title"]',
      'div[class*="container-Uxvbjy"]', // 空行容器
      'div[class*="md-box-line-break"]', // 行断裂容器
      'div[class*="wrapper-GYqxgQ"]' // 包装容器
    ]
  },

  features: {
    hasSearch: false,
    titleFromFirstQuestion: true,
    useTextContent: false,
    pairByClassifiedTurns: true,
    segmentSingleAnswerByQuestions: true
  }
};

/**
 * Gemini 平台配置
 */
const geminiConfig = {
  name: 'Gemini',
  urlPatterns: ['gemini.google.com'],
  selectors: {
    conversation: '.conversation-container',
    title: null,
    question: '.user-query-container',
    answer: '.response-container',
    thinking: null,
    markdownBlock: '.markdown'
  },

  features: {
    titleFromDocumentTitle: true
  }
};

/**
 * Grok 平台配置
 */
const grokConfig = {
  name: 'Grok',
  urlPatterns: ['grok.com'],
  selectors: {
    conversation: null,
    title: null,
    question: '[data-testid="user-message"]',
    answer: '[data-testid="assistant-message"]',
    thinking: null,
    markdownBlock: '.response-content-markdown',
    cleanupSelectors: [
      'button',
      'svg',
      '.inline-media-container',
      '[data-testid*="action"]'
    ]
  },

  features: {
    titleFromFirstQuestion: true
  }
};

/**
 * Kimi 平台配置
 */
const kimiConfig = {
  name: 'Kimi',
  urlPatterns: ['kimi.com', 'moonshot.cn'],
  selectors: {
    conversation: null,
    title: null,
    question: '.user-content',
    answer: '.chat-content-item.chat-content-item-assistant .markdown-container, .markdown-body .markdown-container, [class*="assistant"] .markdown-container',
    thinking: null,
    markdownBlock: null // Kimi usually has markdown-container
  },

  features: {}
};

// ===== 导出配置 =====

/**
 * 所有平台配置
 */
export const SELECTORS = {
  deepseek: deepseekConfig,
  yuanbao: yuanbaoConfig,
  chatgpt: chatgptConfig,
  doubao: doubaoConfig,
  gemini: geminiConfig,
  grok: grokConfig,
  kimi: kimiConfig
};

/**
 * 根据URL获取平台配置
 */
export function getPlatformConfig(url) {
  for (const [platformKey, config] of Object.entries(SELECTORS)) {
    for (const pattern of config.urlPatterns) {
      if (url.includes(pattern)) {
        return {
          key: platformKey,
          ...config
        };
      }
    }
  }
  return null;
}

export function extractUnifiedData(url) {
  const platformConfig = getPlatformConfig(url);

  if (!platformConfig) {
    throw new Error('Unsupported website');
  }

  const { key: platformKey, name, selectors, features = {} } = platformConfig;
  const conversations = [];

  let title = `${platformKey}-chat`;
  if (selectors.title) {
    const titleEl = document.querySelector(selectors.title);
    title = titleEl?.textContent?.trim() || title;
  }

  if (features.titleFromDocumentTitle && document.title?.trim()) {
    title = document.title.trim().replace(/\s+-\s+Google Gemini$/, '');
  }

  // 1. 优先尝试使用嵌套模式 (Conversation Item)
  if (selectors.conversation) {
    const items = document.querySelectorAll(selectors.conversation);
    if (items.length > 0) {
      items.forEach(item => {
        const questionEl = item.querySelector(selectors.question);
        const answerBlock = item.querySelector(selectors.answer);
        
        if (questionEl && answerBlock) {
          const question = questionEl.textContent?.trim() || '';
          const answer = _processAnswer(answerBlock, selectors, features);
          conversations.push({ question, answer });
        }
      });
    }
  }

  // 2. 如果没有找到 items 或没配置 conversation 选择器，回退到扁平模式 (Flat Mode)
  if (conversations.length === 0) {
    if (features.pairByTurns && selectors.turn) {
      const pairedTurns = _extractConversationsByTurns(selectors, features);
      conversations.push(...pairedTurns);

      if (features.titleFromFirstQuestion) {
        title = pairedTurns[0]?.question?.substring(0, 50) || title;
      }
    } else {
      const questions = _getNormalizedElements(selectors.question);

      if (features.titleFromFirstQuestion) {
        title = questions[0]?.textContent?.trim().substring(0, 50) || title;
      }

      if (features.pairByClassifiedTurns && selectors.turn) {
        conversations.push(
          ..._extractConversationsByClassifiedTurns(selectors, features)
        );
      }

      if (conversations.length === 0 && features.segmentSingleAnswerByQuestions) {
        conversations.push(
          ..._extractConversationsByQuestionSegments(questions, selectors, features)
        );
      }

      if (conversations.length === 0) {
        const answers = _getNormalizedElements(selectors.answer);
        const count = Math.min(questions.length, answers.length);

        for (let i = 0; i < count; i++) {
          const question = questions[i]?.textContent?.trim() || '';
          const answerBlock = answers[i];
          const answer = _processAnswer(answerBlock, selectors, features);
          conversations.push({ question, answer });
        }
      }
    }
  }

  return { title, conversations, platform: name, url };
}

function _getNormalizedElements(selector, context = document) {
  if (!selector) return [];

  const elements = Array.from(context.querySelectorAll(selector))
    .filter(element => element.textContent?.trim());

  const outermostElements = elements.filter(element => {
    return !elements.some(other =>
      other !== element &&
      other.contains(element)
    );
  });

  return outermostElements.sort((a, b) => {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function _extractConversationsByQuestionSegments(questions, selectors, features) {
  if (questions.length === 0 || !selectors.answer) return [];

  const answerHosts = Array.from(document.querySelectorAll(selectors.answer))
    .filter(host => host.textContent?.trim());

  const hostCandidates = answerHosts
    .map(host => ({
      host,
      questions: questions.filter(question => host.contains(question))
    }))
    .filter(candidate => candidate.questions.length > 0);

  if (hostCandidates.length === 0) return [];

  const conversations = [];

  questions.forEach(questionElement => {
    const candidates = hostCandidates
      .filter(candidate => candidate.host.contains(questionElement))
      .sort((a, b) => a.questions.length - b.questions.length);
    const candidate = candidates[0];
    if (!candidate) return;

    const questionIndex = candidate.questions.indexOf(questionElement);
    const nextQuestion = candidate.questions[questionIndex + 1] || null;
    const answerBlock = _cloneRangeAfterQuestion(
      candidate.host,
      questionElement,
      nextQuestion
    );
    if (!answerBlock) return;

    const question = questionElement.textContent?.trim() || '';
    const answer = _processAnswer(answerBlock, selectors, features);
    if (!question || !_hasMeaningfulAnswer(answer)) return;

    conversations.push({ question, answer });
  });

  return conversations;
}

function _extractConversationsByClassifiedTurns(selectors, features) {
  const turns = _getNormalizedElements(selectors.turn);
  const conversations = [];
  let pendingQuestion = '';

  turns.forEach(turn => {
    const questionElement =
      (turn.matches(selectors.question) ? turn : null) ||
      turn.querySelector(selectors.question);

    if (questionElement) {
      const question = questionElement.textContent?.trim() || '';
      if (question) pendingQuestion = question;
      return;
    }

    const answerBlock =
      (turn.matches(selectors.answer) ? turn : null) ||
      turn.querySelector(selectors.answer);

    if (!answerBlock || !pendingQuestion) return;

    const answer = _processAnswer(answerBlock, selectors, features);
    if (!_hasMeaningfulAnswer(answer)) return;

    conversations.push({ question: pendingQuestion, answer });
    pendingQuestion = '';
  });

  return conversations;
}

function _cloneRangeAfterQuestion(answerHost, questionElement, nextQuestion) {
  try {
    const range = document.createRange();
    range.setStartAfter(questionElement);

    if (nextQuestion && answerHost.contains(nextQuestion)) {
      range.setEndBefore(nextQuestion);
    } else {
      range.selectNodeContents(answerHost);
      range.setStartAfter(questionElement);
    }

    const answerBlock = answerHost.cloneNode(false);
    answerBlock.appendChild(range.cloneContents());
    return answerBlock;
  } catch (error) {
    console.warn('AI Chat Export Pro: Failed to segment Doubao answer', error);
    return null;
  }
}

function _hasMeaningfulAnswer(answer) {
  return Boolean(
    answer?.content ||
    answer?.thinking ||
    answer?.search ||
    (answer?.codeBlocks && answer.codeBlocks.length > 0)
  );
}

function _extractConversationsByTurns(selectors, features) {
  const turns = Array.from(document.querySelectorAll(selectors.turn));
  const conversations = [];
  let pendingQuestion = '';

  turns.forEach(turn => {
    const role = turn.getAttribute('data-turn');
    if (role === 'user') {
      const question = _extractQuestionText(turn);
      if (question) pendingQuestion = question;
      return;
    }

    if (role === 'assistant') {
      const answer = _processAnswer(turn, selectors, features);
      const hasMeaningfulContent = _hasMeaningfulAnswer(answer);

      if (pendingQuestion && hasMeaningfulContent) {
        conversations.push({ question: pendingQuestion, answer });
        pendingQuestion = '';
      }
    }
  });

  return conversations;
}

function _extractQuestionText(questionBlock) {
  const candidates = [
    '.whitespace-pre-wrap',
    '[dir="auto"]',
    'p',
    'div'
  ];

  for (const selector of candidates) {
    const element = questionBlock.querySelector(selector);
    const text = element?.textContent?.trim();
    if (text) return text;
  }

  return questionBlock.textContent?.trim() || '';
}

function _processAnswer(answerBlock, selectors, features) {
  const answer = {};

  if (features.hasThinking && selectors.thinking) {
    answer.thinking = _extractThinking(answerBlock, selectors);
  }

  if (features.hasSearch && selectors.search) {
    if (features.searchWithLinks) {
      answer.search = _extractSearchWithLinks(answerBlock, selectors);
    } else if (features.searchAsText) {
      answer.search = answerBlock.querySelector(selectors.search)?.textContent?.trim() || '';
    } else {
      answer.search = _extractSearch(answerBlock, selectors, features);
    }
  }

  let contentBlock = answerBlock;
  if (features.removeThinkingBeforeContent && selectors.thinking) {
    const clone = answerBlock.cloneNode(true);
    clone.querySelectorAll(selectors.thinking).forEach(el => el.remove());
    contentBlock = clone;
  }

  if (features.useTextContent) {
    answer.content = contentBlock.textContent.trim();
  } else {
    answer.content = _extractContent(contentBlock, selectors);
  }

  if (features.hasCodeBlocks && selectors.codeBlock) {
    answer.codeBlocks = _extractCodeBlocks(contentBlock, selectors);
  }

  return answer;
}

function _extractThinking(answerBlock, selectors) {
  const thinking = answerBlock.querySelector(selectors.thinking);
  if (!thinking) return '';
  const paragraphs = thinking.querySelectorAll('p');
  if (paragraphs.length === 0) return thinking.textContent.trim();
  return Array.from(paragraphs).map(p => p.textContent.trim()).filter(Boolean).join('\n');
}

function _extractSearch(answerBlock, selectors, features) {
  const search = answerBlock.querySelector(selectors.search);
  if (!search) return '';
  const searchText = search.textContent.trim();
  if (!searchText) return '';
  if (features.searchKeyword && !searchText.includes(features.searchKeyword)) return '';
  return searchText;
}

function _extractSearchWithLinks(answerBlock, selectors) {
  const search = answerBlock.querySelector(selectors.search);
  if (!search || !search.textContent.trim()) return '';

  let content = '';

  const header = search.querySelector('.hyc-card-box-search-ref__content__header');
  if (header) {
    content += header.textContent.trim() + '\n';
  }

  const references = search.querySelectorAll('ul li.hyc-card-box-search-ref-content-detail');
  references.forEach((ref, index) => {
    const title = ref.getAttribute('data-title');
    const url = ref.getAttribute('data-url');
    content += `${index + 1}. [${title}](${url})\n`;
  });

  return content.trim();
}

function _extractContent(answerBlock, selectors) {
  if (!selectors.markdownBlock) {
    return answerBlock.textContent.trim();
  }

  // querySelectorAll 不匹配元素自身。当 answer 和 markdownBlock 选择器相同时
  //（如豆包的 flow-markdown-body），需要额外检查 answerBlock 本身。
  const descendantBlocks = Array.from(answerBlock.querySelectorAll(selectors.markdownBlock));
  const selfMatch = answerBlock.matches(selectors.markdownBlock) ? [answerBlock] : [];
  const markdownBlocks = [...selfMatch, ...descendantBlocks];

  if (markdownBlocks.length === 0) return '';

  const parts = markdownBlocks
    .map(block => _processMarkdownBlock(block, selectors))
    .filter(Boolean);

  return parts.join('\n\n').trim();
}

function _processMarkdownBlock(markdownBlock, selectors) {
  const cleanupSelectors = selectors.cleanupSelectors || [];
  const block = markdownBlock.cloneNode(true);

  cleanupSelectors.forEach(sel => {
    block.querySelectorAll(sel).forEach(el => el.remove());
  });

  if (selectors.codeBlock) {
    block.querySelectorAll(selectors.codeBlock).forEach(el => el.remove());
  }

  let content = '';

  block.childNodes.forEach(node => {
    const html = node.outerHTML || node.textContent;
    if (html) {
      content += _htmlToMarkdown(html);
      content += '\n';
    }
  });

  return content.trim();
}

function _extractCodeBlocks(answerBlock, selectors) {
  const codeBlocks = [];
  const codeElements = answerBlock.querySelectorAll(selectors.codeBlock);

  codeElements.forEach(codeElement => {
    let language = '';
    if (selectors.codeLanguage) {
      const languageEl =
        codeElement.querySelector(selectors.codeLanguage) ||
        codeElement.closest('*')?.querySelector(selectors.codeLanguage) ||
        answerBlock.querySelector(selectors.codeLanguage);
      language = languageEl ? languageEl.textContent.trim() : '';
    }

    const code =
      codeElement.querySelector('pre')?.textContent ||
      codeElement.querySelector('code')?.textContent ||
      codeElement.textContent;

    if (code && code.trim()) {
      codeBlocks.push({ language, code: code.trim() });
    }
  });

  return codeBlocks;
}

function _htmlToMarkdown(html) {
  if (!html) return '';

  // 1. 尝试使用 Turndown (如果已注入)
  if (typeof TurndownService !== 'undefined') {
    try {
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
      });
      
      if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
      }
      
      // 清理不需要的标签
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const body = doc.body;
      const unwanted = body.querySelectorAll('script, style, svg, button, input, select, textarea');
      unwanted.forEach(el => el.remove());
      
      return turndownService.turndown(body);
    } catch (e) {
      console.error('Turndown conversion failed:', e);
      // Fallback to custom implementation
    }
  }

  // 2. 自定义兜底实现
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    let content = '';
    node.childNodes.forEach(child => {
      content += processNode(child);
    });

    const tagName = node.tagName.toLowerCase();

    switch (tagName) {
      case 'h1': return `# ${content}\n\n`;
      case 'h2': return `## ${content}\n\n`;
      case 'h3': return `### ${content}\n\n`;
      case 'h4': return `#### ${content}\n\n`;
      case 'h5': return `##### ${content}\n\n`;
      case 'h6': return `###### ${content}\n\n`;

      case 'p': return `${content}\n\n`;
      case 'br': return '\n';
      case 'hr': return '---\n\n';
      case 'div': return `${content}\n`;

      case 'strong':
      case 'b': return `**${content}**`;
      case 'em':
      case 'i': return `*${content}*`;

      case 'code':
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
          return content;
        }
        return `\`${content}\``;

      case 'pre': {
        const langClass = node.querySelector('code')?.className || '';
        const langMatch = langClass.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] : '';
        return `\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n\n`;
      }

      case 'ul': return `${content}\n`;
      case 'ol': return `${content}\n`;
      case 'li': {
        const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : 'ul';
        const prefix = parentTag === 'ol' ? '1. ' : '- ';
        return `${prefix}${content}\n`;
      }

      case 'a': {
        const href = node.getAttribute('href');
        return href ? `[${content}](${href})` : content;
      }

      case 'blockquote':
        return `> ${content.trim().replace(/\n/g, '\n> ')}\n\n`;

      default:
        return content;
    }
  }

  let markdown = processNode(body);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  markdown = markdown
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

  return markdown;
}
