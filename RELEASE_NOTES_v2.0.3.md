# v2.0.3: ChatGPT 目录稳定性修复

## 主要修复

- 修复 ChatGPT 虚拟列表下目录错排、跳转串位的问题。
- 保留 DOM 中已加载的 AI 回答标题，不再把 ChatGPT 简化成纯问题列表。
- 使用 ChatGPT 原生 Prompt 锚点补齐 DOM 外的问题项。
- 修复所有平台侧边栏“收起所有”后，滚动或跳转导致目录重新展开的问题。
- 避免 ChatGPT URL 切换后旧对话目录覆盖当前侧边栏。

## 其他改进

- 导出完成提示会显示当前已加载 DOM 的问题范围。
- 收紧 ChatGPT selector，避免左侧导航和历史记录混入目录。
- 优化 Kimi/Gemini selector 与 Kimi Markdown 导出处理。

## 安装测试

1. 下载 `ai-chat-export-pro-v2.0.3.zip`。
2. 解压到本地目录。
3. 打开 Chrome/Edge 扩展管理页面。
4. 开启开发者模式。
5. 选择“加载已解压的扩展程序”，加载解压后的目录。
