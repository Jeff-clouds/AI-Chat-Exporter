# Skill: DOM Selector Audit

验证 AI-Chat-Exporter 和 AI-Chat-Outline 两个项目的 DOM 选择器是否与各平台当前 DOM 结构匹配。

## 前置条件

- Chrome 已运行且已登录各平台账号
- Chrome 已开启「Allow JavaScript from Apple Events」（cua-driver 需要）
- 测试链接配置: `scripts/test-urls.json`

## 快速执行

### 方法 1: cua-driver（推荐，不需要 CDP）

```
1. cua-driver__list_windows(pid=Chrome PID) → 找到窗口
2. cua-driver__page(action=execute_javascript) → 注入检查脚本
3. 逐平台导航并验证
```

### 方法 2: CDP（需 Chrome 开启 --remote-debugging-port=9222）

```bash
cd AI-Chat-Exporter
node scripts/audit-current-dom-selectors.mjs
```

### 方法 3: Chrome Apple Events（保留登录态）

```bash
cd AI-Chat-Exporter
node scripts/audit-current-chrome-profile.mjs
```

## 检查脚本模板

在每个平台的对话页面执行以下 JS：

```javascript
(() => {
  const selectors = {
    // 按平台配置填入 question/answer/thinking/markdownBlock 等选择器
  };
  
  const results = {};
  for (const [name, sel] of Object.entries(selectors)) {
    try {
      const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
      let total = 0;
      const partDetails = [];
      for (const part of parts) {
        const count = document.querySelectorAll(part).length;
        total += count;
        partDetails.push({ selector: part, count });
      }
      results[name] = { selector: sel, total, partDetails, status: total > 0 ? 'PASS' : 'MISS' };
    } catch(e) {
      results[name] = { selector: sel, error: e.message, status: 'ERROR' };
    }
  }
  
  results._meta = {
    url: location.href,
    title: document.title,
    bodyLength: document.body?.innerText?.length || 0
  };
  
  return JSON.stringify(results, null, 2);
})()
```

## 各平台选择器速查

### DeepSeek
```javascript
{
  title: '.f8d1e4c0',
  question: '._9663006',
  answer: '._4f9bf79._43c05b5',
  thinking: '.ds-think-content, ._74c0879',
  search: '.a6d716f5.db5991dd',
  markdownBlock: '.ds-markdown',
  codeBlock: '.md-code-block',
  codeLanguage: '.md-code-block-infostring'
}
```

### YuanBao
```javascript
{
  title: '.agent-dialogue__content--common__header',
  question: '.agent-chat__bubble--human',
  answer: '.agent-chat__bubble--ai',
  thinking: '.hyc-component-deepsearch-cot__think, .hyc-component-reasoner__think',
  markdownBlock: '.hyc-common-markdown',
  codeBlock: '.hyc-common-markdown__code pre.hyc-common-markdown__code-lan',
  codeLanguage: '.hyc-common-markdown__code__hd__l'
}
```

### ChatGPT
```javascript
{
  turn: '[data-turn]',
  question: '[data-turn="user"]',
  answer: '[data-turn="assistant"]',
  markdownBlock: '.markdown.prose, .markdown'
}
```

### Doubao
```javascript
{
  title: 'div.group\\/title',
  question: 'div[class*="send-msg-bubble"], div[class*="bg-g-send-msg-bubble-bg"]',
  answer: 'div[class*="conversation-page-message-host"]',
  markdownBlock: 'div[class*="conversation-page-message-host"]'
}
```

### Gemini
```javascript
{
  conversation: '.conversation-container',
  question: '.user-query-container',
  answer: '.response-container',
  markdownBlock: '.markdown'
}
```

### Grok
```javascript
{
  question: '[data-testid="user-message"]',
  answer: '[data-testid="assistant-message"]',
  markdownBlock: '.response-content-markdown'
}
```

### Kimi
```javascript
{
  question: '.user-content',
  answer: '.chat-content-item.chat-content-item-assistant .markdown-container, .markdown-body .markdown-container, [class*="assistant"] .markdown-container'
}
```

## 固定测试链接

在 `scripts/test-urls.json` 中维护，修改一处即可同步所有审计脚本。

| 平台 | URL |
|------|-----|
| DeepSeek | `https://chat.deepseek.com/a/chat/s/c731cccb-0f0d-4993-9332-3e86299d81db` |
| YuanBao | `https://yuanbao.tencent.com/chat/naQivTmsDa/105fec2b-3cf5-4382-92d7-e09e60da4b7b` |
| ChatGPT | `https://chatgpt.com/c/69393a71-a410-8329-b70a-c1bab3d8b2fd` |
| Doubao | `https://www.doubao.com/chat/38425731801360898` |
| Gemini | `https://gemini.google.com/app/404aea77190bc75f` |
| Kimi | `https://www.kimi.com/chat/19d04d17-fca2-8505-8000-09c908509e39?chat_enter_method=history` |
| Grok | `https://grok.com/c/7bb32de1-a9f4-4ba0-99b9-f4760eca1335?rid=b681c7a6-8574-494a-a2ff-978622800359` |

## 已知问题

- **Grok**: Cloudflare 安全验证会拦截自动化访问，需手动通过验证后再审计
- **search/codeBlock 选择器**: 当对话中没有搜索结果或代码块时 MISS 是正常的
- **doubao.title**: `div.group\\/title` 在 JS 和 JSON 中转义方式不同，但效果一致

## 审计报告

报告输出到 `scripts/reports/` 目录，文件名格式: `manual-audit-YYYY-MM-DD.json`

## 更新选择器流程

1. 打开目标平台对话页面
2. 用 DevTools 或 `document.querySelectorAll` 探索新 DOM 结构
3. 找到稳定的选择器（优先用 data-testid、语义化 class，避免随机 hash class）
4. 更新 `src/config/selectors.js`（Exporter）和 `src/config/selectors.json`（Outline）
5. 更新本文件中的「各平台选择器速查」
6. 跑一遍完整审计确认所有平台 PASS
7. git commit + push
