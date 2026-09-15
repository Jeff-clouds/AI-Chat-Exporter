# AI Chat Exporter

[中文（默认）](README.md) | [English](README.en.md)

> **AI documentation notice:** This document was written by AI and may be inaccurate. Before acting on it, verify against the current code, applicable project rules, real runtime behavior, and official sources where needed.

> A sidebar outline and multi-format export tool for long AI conversations.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ai-chat-exporter/eplnkdnnbmmijjadnabdefmjnjgapigm)
[![Microsoft Edge Add-ons](https://img.shields.io/badge/Microsoft_Edge_Add--ons-Install-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/ai-chat-exporter/kjhchmmjjffhhgaoocijicockllaoaah)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**AI Chat Exporter** helps you browse, find, and save long AI conversations. It creates a conversation outline in a browser side panel, lets you jump to headings, and exports the current conversation as Markdown, HTML, JSON, or TXT.

Exporter is the only actively maintained product name. **Pro is a paid feature tier inside the extension, not a separate extension.** The outline navigation and partial-export capabilities from AI Chat Export Pro have been merged into this repository and the same store listing.

## Key features

- **Side-panel outline:** Identifies prompts, answers, and headings inside answers.
- **Jump to content:** Select an outline entry to navigate to the matching prompt or answer.
- **Reading-position highlight:** Keeps the current outline item in sync while you scroll long conversations.
- **Full Markdown export:** Export the current conversation for free, preserving readable text, code blocks, reasoning, and search results.
- **Pro partial export:** Select important prompt groups and export only those groups with their full answers.
- **Pro multi-format export:** Export complete or partial conversations as HTML, JSON, or TXT.
- **Runs on demand:** Analyzes pages only when the side panel is open or you initiate an export; ongoing observation and indexing stop when the panel closes.
- **Local processing:** Conversation data is read and transformed locally in the browser, without upload to a developer server.

## Free and Pro

| Feature | Free | Pro |
| --- | :---: | :---: |
| Side-panel outline and navigation | ✅ | ✅ |
| Reading-position highlight | ✅ | ✅ |
| Full Markdown export | ✅ | ✅ |
| Select prompt groups for partial export, including Markdown | — | ✅ |
| HTML, JSON, and TXT export | — | ✅ |

Pro is unlocked with a license code. No account or device binding is required; activation is stored locally in the browser.

The current founder price is **CNY 9.9 for lifetime access to current and future Pro features**. Pricing for new users may increase as the feature set evolves; existing purchasers will not need to pay the difference. License codes are digital goods and cannot be refunded without reason after delivery. Contact the developer for duplicate payments or activation problems.

[Buy or learn about Pro](https://wj.qq.com/s2/26957751/9rvt/)

## Supported platforms

| Platform | URL | Supported content |
| --- | --- | --- |
| DeepSeek | deepseek.com | Conversations, reasoning, code, and search results |
| Tencent Yuanbao | yuanbao.tencent.com | Conversations, deep reasoning, reference links, and cards |
| ChatGPT | chatgpt.com | Conversations, headings inside answers, and code blocks |
| Doubao | doubao.com | Conversations, headings inside answers, and search sources |
| Gemini | gemini.google.com | Legacy compatibility: conversations and drafts (**no longer maintained**) |
| Grok | grok.com | Legacy compatibility: conversations and Markdown (**no longer maintained**) |
| Kimi | kimi.com / moonshot.cn | Conversations, code blocks, and Markdown |

## Installation

### Chrome Web Store (recommended)

[Install AI Chat Exporter from the Chrome Web Store](https://chromewebstore.google.com/detail/ai-chat-exporter/eplnkdnnbmmijjadnabdefmjnjgapigm)

The store version updates automatically and suits most users.

### Microsoft Edge Add-ons

[Install AI Chat Exporter from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ai-chat-exporter/kjhchmmjjffhhgaoocijicockllaoaah)

The Edge store version updates automatically.

### GitHub Releases

1. Download and unzip the latest `.zip` file from [Releases](https://github.com/Jeff-clouds/AI-Chat-Exporter/releases).
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable Developer mode and choose **Load unpacked**.
4. Select the extracted extension folder.

### Local development

```bash
git clone https://github.com/Jeff-clouds/AI-Chat-Exporter.git
```

No additional build is required; load the project directory from your browser's extension-management page.

## How to use

1. Open a supported AI conversation page.
2. Select the **AI Chat Exporter** toolbar icon to open the side panel.
3. Select an outline item to find its content; use the arrow to expand or collapse answer headings.
4. Choose an export format. Markdown is free for everyone; HTML, JSON, and TXT require Pro.
5. Select **Export full conversation** to save the file. Pro users can also enter selection mode and export only checked prompt groups.

### Long ChatGPT and Doubao conversations

- **ChatGPT:** The extension first attempts to read the full conversation data. If it is temporarily unavailable, it creates the outline and export from content currently loaded in the page.
- **Doubao:** To avoid scrolling the page on your behalf or interrupting reading, the outline progressively fills in as you browse. Exports include content that has loaded and completed indexing.

If the outline is incomplete, continue scrolling the original conversation normally; you do not need to reopen the side panel.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+O` (`Command+Shift+O` on macOS) | Open or close the side panel |
| `Alt+O` | Expand or collapse all outline entries |
| `Alt+J` | Go to the next heading |
| `Alt+K` | Go to the previous heading |

## Privacy

- The extension reads content only on supported AI conversation pages that you have opened, to create outlines and perform user-initiated local exports.
- Conversation content is not uploaded to developer servers or used for advertising, analytics, or profiling.
- The extension stores only UI state and Pro activation state locally in the browser.

See the [privacy policy (Chinese)](privacy-policy.md) for the complete policy.

## Development and feedback

Issues and pull requests are welcome in the [GitHub repository](https://github.com/Jeff-clouds/AI-Chat-Exporter/issues).

If the maintainer checkout has the private workspace configured, read `private-docs/architecture/PLATFORM_HOST_ARCHITECTURE_SUMMARY.md` and then `private-docs/architecture/PLATFORM_ARCHITECTURE_GUIDE.md` before changing platform adapters, outlines, exports, routes, or caches. Otherwise, use the current code and public repository rules as the baseline.

Main directories:

- `src/core/`: side panel, page indexing, license state, and background logic
- `src/config/`: platform-page recognition configuration
- `src/export/`: Markdown, HTML, JSON, and TXT generation and file download
- `public/assets/`: extension icons and public assets

See [CHANGELOG.md](CHANGELOG.md) and [GitHub Releases](https://github.com/Jeff-clouds/AI-Chat-Exporter/releases) for complete version history.

## Author

- Jeff (大王)
- [Xiaohongshu: 王路飞汐汐](https://www.xiaohongshu.com/user/profile/5cb950aa0000000011035bef) (206524823)
- [Jike: 王路飞汐汐](https://okjk.co/uFbsJq)

## License

This project is open source under the [MIT License](LICENSE).
