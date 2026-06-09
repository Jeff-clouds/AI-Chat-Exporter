# AI Chat Export Pro 架构文档 (v2.0.1)

本文档详细说明了 AI Chat Export Pro 扩展程序的架构设计。v2.0.1 是原 AI Chat Outline 的迭代合并版，以侧边栏大纲为主入口，并合并完整 Markdown 导出与 Pro 局部导出能力。

## 1. 核心设计理念

*   **配置即逻辑**：通过增强配置文件的表达能力（引入 `conversation` 容器、`features` 开关），大幅减少核心逻辑代码的修改频率。
*   **嵌套优先 (Nested-First)**：为了解决“问答错位”问题，提取逻辑优先寻找“对话容器”（Conversation Container），在容器内部提取问答对，确保一一对应。
*   **全局无污染**：虽然为了兼容 Content Script 的注入模式，我们使用了 `window` 对象挂载全局变量，但通过清理机制确保了页面重载或插件更新时的环境清理。

## 2. 目录结构

```text
/
├── manifest.json          # 扩展清单文件 (V3)
├── src/
│   ├── config/
│   │   └── selectors.js   # [配置层] 模块化配置 (选择器 + 功能开关 + URL匹配)
│   ├── core/
│   │   ├── pipeline.js    # [逻辑层] 智能 Pipeline，支持嵌套/扁平模式自动切换
│   │   ├── content.js     # [入口层] 负责初始化 Pipeline、DOM 监听和阅读位置检测
│   │   ├── background.js  # [服务层] 负责按顺序注入脚本
│   │   ├── sidepanel.js   # [视图层] 侧边栏 UI 渲染与交互
│   │   └── sidepanel.html # [视图层] 侧边栏结构
│   └── utils/
│       └── common.js      # [工具层] 通用辅助函数 (ID生成、节流、排序等)
├── public/
│   └── assets/            # 静态资源
└── unused/                # 归档文件
```

## 3. 核心数据流 (Pipeline Workflow)

### 3.1 识别与配置加载
1.  `Pipeline` 实例化时，调用 `_getPlatformConfig(url)`。
2.  遍历 `src/config/selectors.js` 中的配置对象，匹配 `urlPatterns`。
3.  加载命中的配置（包含 `selectors` 和 `features`）。

### 3.2 智能提取策略 (Smart Extraction)
Pipeline 根据配置中的 `selectors` 自动决定提取策略，**无需人工干预**：

*   **策略 A：嵌套模式 (Nested Mode) [推荐]**
    *   **触发条件**：配置中定义了 `selectors.conversation`（对话容器选择器）。
    *   **流程**：
        1.  查找所有 Conversation 容器。
        2.  在每个容器内，分别查找 `question` 和 `answer` 元素。
        3.  **优势**：即使问答数量不一致或页面动态加载，也能确保问题和回答精准配对，绝不错位。
    *   **适用**：ChatGPT, Gemini, 以及任何结构规范的 AI 网站。

*   **策略 B：扁平模式 (Flat Mode) [兼容]**
    *   **触发条件**：未定义 `conversation` 选择器。
    *   **流程**：
        1.  分别查找页面上所有的 `question` 列表和 `answer` 列表。
        2.  按索引位置一一对应（第1个问题配第1个回答）。
    *   **适用**：DOM 结构较为扁平或尚未分析出容器结构的网站（如 Grok）。

### 3.3 特性处理 (Feature Processing)
在提取过程中，Pipeline 会根据 `features` 开关动态处理内容：

*   **removeThinking**: 如果开启，在提取大纲时会自动跳过位于“思考过程”（Thinking Process）容器内的标题，防止大纲被思考步骤污染（针对 DeepSeek R1 等推理模型）。

### 3.4 内置过滤规则 (Built-in Filters)
除了配置驱动的特性外，Pipeline 还内置了一些通用的过滤规则以提升鲁棒性：
*   **辅助阅读文本过滤**：自动忽略带有 `.sr-only` 类的元素（如 ChatGPT 的 "ChatGPT说" 隐藏标题），防止其污染大纲。
*   **空内容过滤**：自动忽略内容为空或只包含空白字符的标题。

## 4. 关键模块说明

### 4.1 src/config/selectors.js (维护核心)
这是维护者**主要打交道**的文件。新增平台只需添加一个配置对象：

```javascript
const newPlatformConfig = {
    name: 'New AI',
    urlPatterns: ['newai.com'],
    selectors: {
        conversation: '.chat-item', // [关键] 填入容器类名即开启嵌套模式
        question: '.user-msg',
        answer: '.ai-msg',
        thinking: '.think-process', // 可选
        HEADINGS: ['h1', 'h2', 'h3']
    },
    features: {
        removeThinking: true // 可选开关
    }
};
```

### 4.2 src/utils/common.js
提供底层支持，其中 `getCurrentSite` 仅用于一些辅助判断，核心识别逻辑已移交 `Pipeline` 类处理，实现了逻辑解耦。

## 5. 验证与调试
*   **Console 日志**: Pipeline 初始化时会打印 `AI Chat Export Pro: Identified platform [Name]`，用于确认配置是否生效。
*   **清理机制**: `content.js` 在重新注入前会调用 `window.chatNavigatorCleanup()`，防止 `MutationObserver` 重复绑定导致性能问题。
