# AI Chat Exporter — Chrome Web Store Listing Copy

> Purpose: Use this copy when completing the Chrome Web Store listing manually. Text inside code blocks is ready to paste; do not copy the explanatory notes into Store fields.

## Product name

```text
AI Chat Exporter
```

Brand rule: **AI Chat Exporter** is the product name. **Pro** refers only to paid features inside the extension, not to a separate extension.

## Short description

Chrome Web Store short descriptions are limited to 132 characters. Recommended copy:

```text
Outline and export long AI chats from ChatGPT, DeepSeek, Doubao and more. Free Markdown; Pro adds HTML, JSON and TXT.
```

## Detailed description

```text
AI Chat Exporter is a browser extension for reading, organizing, and saving long AI conversations locally.

Open a supported AI chat page and the extension creates a question-and-answer outline in your browser side panel. Click an item to jump to the relevant content, or export the current conversation as a Markdown file for continued work in Obsidian, Notion, Typora, or another knowledge-management tool.

Key features

• Side-panel conversation outline: Automatically identifies questions, answers, and headings within answers
• Quick navigation: Click an outline item to jump to the relevant place in the conversation
• Reading-position highlight: Shows your current reading position while you scroll through a long chat
• Full Markdown export: Export the currently loaded content of the current conversation for free
• Content preservation: Preserves readable text, code blocks, reasoning content, and search results whenever available
• Pro partial export: Select important question groups and export only the selected questions with their complete answers
• Pro multi-format export: Export full or selected conversations as HTML, JSON, or TXT
• Runs on demand: Analyzes pages only while the side panel is open or when you explicitly export; ongoing listeners stop when the side panel closes

Supported platforms

DeepSeek, Tencent Yuanbao, ChatGPT, Doubao, Gemini, Grok, and Kimi.

Long-conversation loading

• ChatGPT: The extension prioritizes complete conversation data. If complete data is temporarily unavailable, it uses the conversation content currently loaded on the page.
• Doubao: To avoid interrupting your reading by automatically scrolling the page, the outline gradually fills in as you browse. Exports include content that has already been loaded and indexed.

Free and Pro

The free version includes the side-panel outline, quick navigation, reading-position highlight, and full Markdown export. Pro adds partial export by selected question group and HTML, JSON, and TXT export formats. Core free features do not require payment.

Pro is unlocked with a license code. No account registration or device binding is required. Purchasing opens an external page provided by the developer. Jeff is the seller of the Pro service; Google is not involved in the transaction. License codes are digital goods and are not eligible for no-reason returns after delivery. Contact the developer for duplicate payments or activation issues.

Privacy

The extension reads content only on supported AI chat pages opened by the user, solely to generate outlines and perform user-initiated exports. Conversation content is processed locally in the browser and is not uploaded to the developer's servers or used for advertising, analytics, or profiling. The extension stores only local interface state and Pro activation state.
```

## Single-purpose description

Use this for the "single purpose" field or a review note:

```text
This extension has one purpose: helping users browse, navigate, and export the AI conversation currently open in their browser. The side-panel outline, reading navigation, full export, and Pro partial export all serve that single purpose of organizing and saving AI conversations.
```

## Permission justifications

Complete the corresponding field shown in the Store dashboard.

### sidePanel

```text
Used to display the AI conversation outline, reading position, and export controls in the browser side panel.
```

### activeTab

```text
Used only when the user opens the extension to access the current tab, identify a supported AI conversation, and generate an outline or export file.
```

### scripting

```text
Used to run local content-recognition logic on supported AI chat pages, extracting the structure of conversation content currently visible or loaded by the user.
```

### tabs

```text
Used to determine whether the current tab belongs to a supported AI chat platform and to update side-panel content when tabs change.
```

### downloads

```text
Used after the user explicitly clicks Export to save generated Markdown, HTML, JSON, or TXT files to the user's local device.
```

### notifications

```text
Used to notify the user about operation results such as completed or failed exports. It is not used for advertising or promotional notifications.
```

### storage

```text
Used to store side-panel interface state, collapsed-state preferences, and Pro license activation status locally in the browser. Conversation text is not stored here.
```

### Host permissions

```text
Used only to read the current conversation page when the user visits a supported AI chat platform, so the extension can generate a side-panel outline and complete user-initiated local exports. The extension does not read other websites or upload conversation content to developer servers.
```

## Privacy disclosure guidance

Data-use declarations in the Store dashboard must match the actual code and privacy policy:

- The extension processes **website content** because it reads AI conversation text.
- It processes **website activity** only to identify the current supported website and chat page for visible outline and export features.
- Data is processed locally only. It is not sold, used for advertising or credit decisions, or made available for developer review.
- Pro activation state is stored locally. Do not disclose license codes, payment credentials, or payment information in public copy.

## Store asset order

Use five `1280 × 800` screenshots in this user-decision order:

1. **Value at a glance:** AI chat page with the side-panel outline. Headline: “See the structure of long chats at a glance”.
2. **Quick navigation:** Show clicking an outline item, jump-to-content, and reading highlight. Headline: “Jump straight back to the answer that matters”.
3. **Free full export:** Show the export button and a Markdown file. Headline: “Export the full conversation to Markdown — free”.
4. **Pro partial and multi-format export:** Show question-group selection and format selection. Headline: “Save the important Q&A and export in the format you need”.
5. **Platforms and privacy:** Use a simple visual to show multi-platform support, local processing, and no conversation uploads.

Screenshots must come from the current release. Do not show the old extension name, an old popup UI, or export formats that are not yet implemented.

## Dashboard links

- Website: `https://github.com/Jeff-clouds/AI-Chat-Exporter`
- Support: `https://github.com/Jeff-clouds/AI-Chat-Exporter/issues`
- Privacy policy: Use GitHub Pages or another publicly accessible privacy-policy URL. Do not use a relative link inside the GitHub repository.
- Store listing: `https://chromewebstore.google.com/detail/ai-chat-exporter/eplnkdnnbmmijjadnabdefmjnjgapigm`

## Pre-publish checklist

- Use “AI Chat Exporter” consistently in the Store name, installed extension name, side-panel copy, and screenshots.
- Promote only released formats: Markdown, HTML, JSON, and TXT. Do not promote unimplemented formats such as PDF or DOCX.
- Clearly distinguish free core features from Pro features.
- The purchase page must clearly show the seller, price, delivery method, and refund policy.
- The Store privacy disclosure, privacy policy, and actual extension behavior must remain consistent.
