# v1.6.0 Release Notes

> **AI documentation notice:** This document was written by AI and may be incorrect. Verify against current code, effective project rules, live behavior, and authoritative sources before acting on it.

## 🎨 主要改进

### ChatGPT 风格设计
- ✅ 深色/浅色双主题支持
- ✅ 采用 ChatGPT 设计语言
- ✅ 现代化界面设计

### 底色块缩进优化
- ✅ 使用 margin-left 实现整体缩进
- ✅ 背景+边框一起移动
- ✅ 缩进层级清晰可见
- ✅ 右侧边缘对齐

### 动画修复
- ✅ 修复目录收起动画
- ✅ 收起目录时下面的目录会移动上来
- ✅ 平滑的展开/收起过渡效果
- ✅ 使用 height 动画替代 max-height

### 样式优化
- ✅ CSS 变量系统重构
- ✅ 添加 --bg-item-border 等变量
- ✅ 增强背景色对比度
- ✅ 优化 toggle 图标尺寸

## 🔧 技术改进

### CSS 架构
- 使用 `margin-left` 替代 `padding-left` 实现缩进
- 使用 `width: calc(100% - margin-left)` 防止溢出
- 添加 `overflow: hidden` 防止文本溢出
- 使用 `!important` 确保 CSS 类覆盖内联样式

### JavaScript 优化
- 使用 `height` 动画替代 `max-height`
- 使用强制重绘 (`offsetHeight`) 确保动画生效
- 过渡完成后清理内联样式
- 统一 toggle 点击处理和 toggleAllDirectories 的逻辑

### 响应式设计
- 两个断点（350px 和 280px）
- 自动调整缩进单位
- 适配不同屏幕尺寸

## 📦 包含的文件

- `manifest.json` - 扩展配置
- `src/core/` - 核心功能文件
  - `sidepanel.html` - 侧边面板界面
  - `sidepanel.js` - 侧边面板逻辑
  - `background.js` - 后台服务
  - `content.js` - 内容脚本
  - `pipeline.js` - 数据处理管道
- `src/config/` - 配置文件
  - `selectors.js` - 选择器配置
  - `selectors.json` - 选择器数据
- `src/utils/` - 工具函数
- `public/assets/` - 资源文件（图标等）

## 🚀 安装方式

1. 下载 `ai-chat-outline-v1.6.0.zip`
2. 打开 Chrome 扩展管理页面 (`chrome://extensions/`)
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择解压后的文件夹

## 📝 支持的网站

- ChatGPT
- DeepSeek Chat
- Google Gemini
- 豆包 AI
- Kimi 智能助手
- Grok
- 元宝 AI

## 🐛 问题修复

- 修复目录收起后下面目录不移动的问题
- 修复展开/收起动画不流畅的问题
- 修复内联样式特异性冲突
- 修复 scrollHeight 读取不准确的问题

## 📊 性能优化

- 动画流畅度提升
- 代码结构优化
- 响应式设计改进
- 双主题自动切换
- 减少重绘和回流

---

**版本**: 1.6.0
**发布日期**: 2026-06-04
**打包大小**: 339KB
**文件数量**: 19 个文件
