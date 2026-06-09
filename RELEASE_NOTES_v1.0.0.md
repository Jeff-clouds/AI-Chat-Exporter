# v1.0.0: AI Chat Export Pro predecessor

## 主要变化

- 基于 AI Chat Outline 合并 AI Chat Exporter 的完整 Markdown 导出能力。
- 保留侧边栏大纲、问题组展示、展开折叠、阅读位置高亮和快捷键导航。
- 在侧边栏顶部新增“导出完整对话”按钮。
- 导出结果保留标题、URL、平台、创建时间、问题、回答、思考过程、搜索结果和代码块。
- 为后续“勾选目录局部导出”预留 conversationId、questionIndex、answerIndex 映射字段。

## 支持平台

- DeepSeek
- 腾讯元宝
- ChatGPT
- 豆包
- Gemini
- Grok
- Kimi

## 安装测试

1. 下载 `ai-chat-knowledge-suite-v1.0.0.zip`。
2. 解压到本地目录。
3. 打开 Chrome/Edge 扩展管理页面。
4. 开启开发者模式。
5. 选择“加载已解压的扩展程序”，加载解压后的目录。

## 验证重点

- 侧边栏大纲是否稳定展示。
- 点击目录项是否能正确跳转。
- “导出完整对话”是否能成功生成 Markdown。
- 导出内容是否和页面当前对话一致。
