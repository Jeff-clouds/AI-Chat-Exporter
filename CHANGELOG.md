# 更新日志 / Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.6] - 2026-07-14

### Changed

- Move the public GitHub repository and release destination to `Jeff-clouds/AI-Chat-Exporter`.

## [2.0.5] - 2026-07-13

### Fixed

- Preserve ChatGPT API Markdown line breaks so H1-H6 headings remain detectable.
- Supplement the complete ChatGPT API message index with headings from currently mounted assistant DOM; mounted DOM no longer gets skipped when the API succeeds.
- Align ChatGPT API turn numbering with rendered `conversation-turn-N` values by excluding the mapping root node.
- Replace stale in-page message-index instances after an extension update so the newest extraction logic takes effect without relying on old cached code.

### Changed

- Render question prefixes as `Q1:` / `Q1: 你说：…` and use a unified CJK font stack for question and answer outline text to avoid mixed-script spacing and baseline drift.

## [2.0.4] - 2026-07-13

### Fixed

- Replace one-time DOM reads for virtualized ChatGPT and Doubao conversations with a deduplicated, ordered message index.
- Read ChatGPT's active conversation branch through its same-origin conversation response when available, with mounted-DOM fallback.
- Stop Doubao from auto-scrolling through the conversation; its outline now silently grows as the user scrolls or an explicit outline jump mounts new messages.
- Remove redundant ChatGPT automatic scrolling during outline jumps.

### Changed

- Keep ChatGPT and Doubao outline/export records keyed by stable message IDs, ordered by turn or virtual-list position, and refreshed silently after new DOM mounts.
- Make export status accurately distinguish passive indexed content from a fully fetched ChatGPT conversation.

## [2.0.3] - 2026-07-06

### Fixed

- Stabilize ChatGPT outline ordering for virtualized conversations by using turn metadata and native Prompt anchors.
- Preserve AI answer headings when ChatGPT user turns are virtualized or temporarily empty.
- Keep side panel collapse state stable across outline refreshes, scrolling, and directory jumps on all supported platforms.
- Prevent stale outlines from a previous ChatGPT URL from replacing the current side panel state.

### Changed

- Improve export range feedback for currently loaded DOM conversations.
- Tighten ChatGPT selectors to avoid non-conversation navigation content.
- Refine Kimi and Gemini selector/export handling.

## [2.0.1] - 2026-06-09

### Changed

- Rename the GitHub repository to `AI-Chat-Export-Pro`.
- Update README clone instructions for the new repository URL.
- Publish the v2.0.1 package as `ai-chat-export-pro-v2.0.1.zip`.

## [2.0.0] - 2026-06-08

### Changed

- Rename the public extension brand to AI Chat Export Pro.
- Position v2.0.0 as the AI Chat Outline successor that combines outline navigation, full Markdown export, and Pro selected conversation export.
- Update packaging output to `ai-chat-export-pro-v2.0.0.zip`.

## [1.6.1] - 2026-06-04

### Fixed

- Align Grok outline selectors with the exporter configuration by using stable `data-testid` message selectors.

## [1.5.3] - 2026-06-02

### ✨ 新功能

- 添加了对 Kimi (`*.kimi.com`) 网站的支持

### 📄 许可证

- 添加了详细的 MIT 许可证文件，明确项目的开源协议条款


## [1.4.0]

### ✨ 新功能

- **一键收起/展开多级目录**: 新增全局操作按钮，支持一键收起或展开所有目录
- **智能状态同步**: 自动检测所有目录状态，按钮文字和图标动态更新
- **底部固定按钮**: 按钮固定在侧边栏底部，不受页面滚动影响

### 🎨 用户体验优化

- **纯蓝色设计**: 采用Google蓝 (#1a73e8) 作为按钮主色调
- **平滑动画效果**: 按钮悬停效果和图标旋转动画
- **响应式布局**: 为底部按钮预留空间，避免内容被遮挡
- **视觉一致性**: 按钮样式与整体界面风格保持一致

### 🔧 技术改进

- **状态管理**: 新增全局状态变量管理目录展开/收起状态
- **事件处理**: 优化单个目录操作与全局操作的协调
- **CSS优化**: 使用固定定位和z-index确保按钮始终可见
- **代码结构**: 新增多个功能函数，提升代码可维护性

### 🐛 问题修复

- 修复了某些情况下目录状态不同步的问题
- 优化了按钮点击区域和交互体验

## [1.3.0]

### 🎉 重大新功能

- **智能阅读位置检测**: 新增实时跟踪用户阅读位置的功能
- **阅读进度指示器**: 添加顶部进度条，显示整体阅读进度
- **自动高亮显示**: 在侧面板中自动高亮当前阅读的大纲项

### ✨ 功能增强

- **Intersection Observer API**: 使用现代API监听元素可见性，性能更优
- **平滑动画效果**: 添加脉冲动画和过渡效果，提升视觉体验
- **智能滚动**: 自动滚动到当前阅读项，保持侧面板同步
- **响应式设计**: 优化小屏幕设备的显示效果

### 🔧 技术改进

- **性能优化**: 使用节流处理滚动事件，避免性能问题
- **内存管理**: 优化观察器生命周期管理
- **错误处理**: 增强错误处理和边界情况处理
- **代码重构**: 简化代码结构，提升可维护性

### 🎨 用户体验

- **即开即用**: 功能默认开启，无需配置
- **界面简化**: 移除设置开关，界面更简洁
- **视觉反馈**: 增强高亮效果和动画表现
- **操作便捷**: 保持原有导航功能的同时增加位置感知

### 🐛 问题修复

- 修复了某些情况下大纲项匹配不准确的问题
- 优化了动态内容更新时的检测逻辑
- 改进了跨标签页通信的稳定性

### 📚 文档更新

- 新增《阅读位置检测功能说明.md》详细文档
- 更新README.md，添加新功能说明
- 完善技术实现文档

## [1.2.0]

### ✨ 新功能

- 支持豆包AI (doubao.com)
- 优化了大纲提取算法
- 改进了UI响应速度

### 🐛 修复

- 修复了某些网站大纲显示不完整的问题
- 优化了内存使用

## [1.1.0]

### ✨ 新功能

- 添加了键盘快捷键支持
- 支持更多AI平台 (Grok, Gemini)
- 改进了侧面板界面

### 🐛 修复

- 修复了页面刷新后大纲丢失的问题
- 优化了DOM变化监听

## [1.0.0]

### 🎉 首次发布

- 支持DeepSeek Chat和ChatGPT
- 基本的大纲提取和导航功能
- 侧面板界面
- 点击跳转功能

### 技术特性 / Technical Features

- Chrome Manifest V3 支持
- 侧边栏集成
- 内容脚本注入
- 实时 DOM 监听
- 跨域通信支持

---

## 版本号说明 / Version Numbering

版本号格式: `主版本号.次版本号.修订号`

- 主版本号：重大功能变更，可能包含不兼容的 API 修改
- 次版本号：新功能添加，但保持向下兼容
- 修订号：bug 修复和小改进

## 计划功能 / Planned Features

- [ ] 支持更多 AI 对话平台
- [ ] 大纲导出功能
- [X] 快捷键支持
- [X] 一键收起/展开功能
- [ ] 搜索功能
