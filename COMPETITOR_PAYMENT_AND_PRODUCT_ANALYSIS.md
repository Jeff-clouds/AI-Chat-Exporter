# AI Chat Exporter 竞品付款、评分与产品策略

> 核验日期：2026-07-16  
> 评分对象：S3 / v2.1.3 当前产品与仓库  
> 原则：公开价格只引用竞品官方页面；技术评分同时考虑跨平台差异、兼容性和降级价值，不把“代码少”或“逻辑统一”本身当成优点。

## 1. 先说结论

AI Chat Exporter 的产品方向值 **8/10**，当前可交付体验值 **6.4/10**。

它不是“又一个格式转换器”。真正有辨识度的是：在七个 AI 网站的原页面上，把长对话变成可浏览、可定位、可选择、可导出的工作对象。问题也很明确：这个定位需要长期对抗七个平台的路由、虚拟列表和 DOM 漂移，而目前只有 ChatGPT、豆包进入了更深的数据/索引路径，其余平台仍主要依赖当前 DOM；同时 9.9 元终身价和外部表单购买不足以支撑这类长期维护成本。

一句话判断：**技术方向比当前口碑可靠，产品价值比当前定价高，但现阶段不能用“支持七个平台”掩盖平台间可靠性不一致。**

## 2. 竞品付款方式

| 产品 | 产品层级 | 收费模式 | 官方公开价格 | 付款与权益方式 |
|---|---|---|---|---|
| LunaTOC | ChatGPT 问题目录、搜索、Prompt 侧栏 | 商店页未展示付费层 | 当前公开为免费安装 | 无需登录；商店声明本地运行、不收集数据[^1] |
| Chat Collapse & Outline | ChatGPT / Gemini / Claude 目录与回答折叠 | 商店页未展示付费层 | 当前公开为免费安装 | 无公开账号或付款要求；商店声明本地运行[^2] |
| Superpower ChatGPT | ChatGPT 文件夹、搜索、tree map、提示词与批量导出 | 免费增值 + 订阅 | Free；Pro 年付 $120，折算 $10/月；月付 $15/月 | 账号订阅；扩展内进入 Stripe Billing Portal 管理[^3][^4] |
| AI Toolbox | ChatGPT / Gemini / Claude / Grok 工作区与批量导出 | 免费增值 + 月订阅 + 单平台/全平台买断 + 企业订阅 | $9.99/月/平台；$99 终身/平台；$149 全平台终身；企业 $12/席/月或年付 $10/席/月 | 个人由 Polar 收款、企业由 LemonSqueezy；支持银行卡、PayPal、Apple Pay、Google Pay[^5] |
| AI Exporter（saveai.net） | 10+ 平台多格式导出、Notion、本地知识库 | 免费增值 + 订阅 | Free；Pro 年付 $46.56，折算 $3.88/月 | 账号订阅；个人资料页管理取消，72 小时退款窗口[^6] |
| AI Chat Exporter（ai-chat-exporter.com） | 多平台 PDF / 图片 / Markdown 等导出 | 免费限额 + 年付订阅 | Starter 年付折算 $1.99/月；Standard 年付折算 $2.99/月 | Stripe；另明确支持支付宝和微信支付；账号仪表盘管理[^7] |
| DeepShare | ChatGPT / Gemini / DeepSeek / Grok 的 Word、公式和长截图 | 免费功能 + 订阅 | Standard $4.9/月；Pro $9.9/月；Pro $49.9/年；Ultra $99.9/年 | 商店内购；公开页未明确支付处理商[^8] |
| ChatGPT Power Exporter | ChatGPT 批量/选择性导出 | 免费限额 + 一次性买断 | Free 最多累计 5 个聊天；Pro €19 一次性 | license key 校验；是否强制注册账号未公开[^9] |
| ChatHub | 多模型侧栏、并行对话、历史搜索与分享 | 月/年订阅 | Pro 年付折算 $14.99/月；Unlimited 年付折算 $24.99/月 | 必须登录后订阅，支持 Google、Apple 或邮箱账号[^10] |

### 付款结构给我们的启示

1. 纯目录工具可以免费获取用户，但功能窄、维护面也窄。
2. 纯导出工具常见低价订阅或一次性买断；价格由 PDF/Word 品质、公式、批量和云同步拉开。
3. 文件夹、全文搜索、跨设备、持续多平台适配的“工作区产品”普遍进入 $9.99–$15/月或 $99–$149 终身区间。
4. 包含模型调用成本的 ChatHub、Monica、MaxAI 不能直接作为本地插件定价锚；它们卖的是模型额度和跨站 AI 助手，不只是寄生工具。
5. 当前 **9.9 元人民币终身** 适合冷启动和创始用户，不适合作为长期标准价。七个平台持续适配的维护义务，与这个价格没有经济匹配。

## 3. 与直接竞品对比

| 维度 | AI Chat Exporter | 主要竞品领先点 | 我们真正的领先点 |
|---|---|---|---|
| 长对话导航 | 问题组 + 回答内标题 + 跳转 + 阅读位置 | LunaTOC 在单一 ChatGPT 上更轻、更容易做稳；Chat Collapse 还提供回答折叠 | 不只列用户问题，还能展开回答内部 H1-H6，并与局部导出连成流程 |
| 平台覆盖 | ChatGPT、豆包、DeepSeek、元宝、Gemini、Grok、Kimi | AI Exporter 宣称 10+ 平台；成熟产品还覆盖 Claude、NotebookLM、Perplexity | 同时覆盖中国和全球主流聊天网站，且不是只做下载按钮 |
| 导出格式 | MD、HTML、JSON、TXT；完整/局部 | AI Exporter、DeepShare 在 PDF、Word、图片、公式、Notion 和模板上明显更强 | 免费完整 Markdown + 按问题组局部导出，和目录选择天然连通 |
| 长会话完整性 | ChatGPT 使用会话数据与 DOM；豆包按已观察窗口累计；其他平台当前 DOM | LunaTOC 宣称支持 ChatGPT 虚拟长会话；成熟导出器有批量历史和本地库 | 已经正视不同宿主的数据结构，没有用一个 selector 模型解释所有平台 |
| 隐私 | 本地读取、转换和下载；授权状态本地保存 | 多个竞品也公开承诺本地处理 | 不注册账号、不绑定机器、无需上传聊天即可使用核心功能 |
| 商业与服务 | 授权码、9.9 元终身、外部购买表单 | 成熟竞品有账号、自动交付、退款窗口、订阅管理、跨设备和支持 SLA | 中国用户支付路径和低试错成本更友好，但还没形成成熟系统 |

## 4. 技术评分

| 技术维度 | 分数 | 判断 |
|---|---:|---|
| 架构稳定性 | **6.2/10** | ChatGPT 的 runtime/API + DOM 混合路径、豆包被动索引、路由令牌和生命周期隔离方向正确；但五个平台仍是直接 DOM 路径，选择器、目录归组和导出归组可能分别漂移。 |
| 性能 | **8.0/10** | 按需注入、侧栏 Port 拥有观察生命周期、关闭后清理、ChatGPT 有界扫描，这些都比全页常驻扫描合理；真实重页面首开、滚动容器替换和长会话仍缺稳定现场 profile，所以不能给到 9 分。 |
| 数据正确性 | **6.0/10** | 已认识到 current branch、message identity、thinking/final content 和 observed range；但平台之间完整性语义不一致，部分路径仍可能按 question/answer 数组配对。 |
| 可维护性 | **6.3/10** | 共享 pipeline、统一模型和平台配置降低重复；目录配置、导出配置和平台特例的重复也承担隔离、fallback 和格式差异，不能简单合并。真正的问题是缺少自动漂移检测和每个平台的真实长会话回归。 |
| 测试与可验证性 | **6.2/10** | 已有路由、性能、导出和 UI 合约测试，并有平台架构门禁；但 fixture 不能证明宿主当前 DOM，Gemini 等平台已经出现“测试可过、现场 selector 为 0”的证据。 |

**技术综合分：6.8/10。**

这里的核心判断不是“架构太复杂”。恰恰相反，多条路径有其合理性：ChatGPT 能获得当前分支数据，豆包只能诚实累计虚拟窗口，其他平台暂时只有 DOM。错误的简化会把平台差异抹掉。需要减少的是没有责任边界、没有一致性测试的重复，而不是所有重复。

## 5. 产品与运营评分

| 运营维度 | 分数 | 判断 |
|---|---:|---|
| 操作流程 | **7.0/10** | 打开浏览器侧栏即可使用，目录、跳转、选择、导出形成同一条任务流；完整 Markdown 免费，降低首次价值体验门槛。局部导出要先进入选择模式再逐项勾选，购买又跳出到外部表单，流程仍有摩擦。 |
| 产品定位 | **7.2/10** | “AI 长对话阅读与带结构导出”比“AI Chat Exporter”这个名字更有差异；覆盖中外七个平台也形成稀缺性。但产品名同质化，平台承诺又领先于现场验证。 |
| 定价与变现 | **4.8/10** | 9.9 元终身明显低于同类一次性和订阅价格，无法覆盖持续 DOM 漂移维护；免费与 Pro 的功能边界清楚，但缺少更高价值层。 |
| 信任与转化 | **5.8/10** | 本地处理、无账号、MIT 开源有利于信任；但新产品缺少用户量、评价、视频演示、失败边界说明和自动退款/交付体系。 |
| 增长与留存 | **5.0/10** | 七个平台带来自然关键词入口，但每个平台都扩大维护成本；尚未形成“导出到 Obsidian/Notion”“长会话回顾”“研究资料归档”等持续内容渠道和复用闭环。 |

**运营综合分：6.0/10。**

当前商店页还有一个现实断层：截至 2026-07-16，公开商店版本是 **2.0.8**，而本分析仓库基线是 v2.1.3；商店只有约 434 位用户、4.0 分和 2 条评分。商店文案已经包含大纲、Markdown 和局部导出，但还没有呈现 v2.1.3 的全部多格式 Pro 事实。发布事实、商店事实和仓库事实必须在运营上保持同步。[^11]

## 6. 产品定位建议

不要把主标题继续停留在“多格式导出”。建议统一为：

> 面向 AI 长对话的侧边栏大纲、快速定位与结构化导出工具。

这句话把最有差异的三步说清楚：先读懂长对话，再定位，再保存。导出格式只是最后一步。

### 免费层

- 七个平台基础大纲与跳转。
- 完整 Markdown 导出。
- 用真实效果建立信任，不用登录换试用。

### Pro 个人层

- 局部问题组导出。
- HTML、JSON、TXT，以及未来 PDF / DOCX。
- 更强搜索、目录筛选、导出模板和批量能力。

### 后续高价值层

- Obsidian / Notion / 本地知识库工作流。
- 多会话批量归档、跨平台统一搜索。
- 可选账号同步，但不能破坏本地优先的核心承诺。

## 7. 定价建议

当前 9.9 元可以保留为“创始用户价”，但应明确截止条件，不要长期锚死。

建议下一阶段测试：

- Pro 终身：**29–49 元**，保持国内个人插件的低决策成本。
- 未来包含 PDF/DOCX、批量、同步后：**69–99 元终身**，或 **9–15 元/月**。
- 已购创始用户永久保留权益，不补差价。

在自动交付、退款和激活诊断没有成熟前，不建议急着上订阅。先把终身买断从“象征性收费”提升到“能覆盖维护”的价格，再观察真实转化。

## 8. 当前最优先的运营动作

1. 商店首屏先演示“30 秒从长对话迷路到点击目录定位”，而不是先列格式。
2. 明确平台可靠性边界：ChatGPT 优先完整会话；豆包是已观察范围；不要用模糊的“全部完整导出”换短期转化。
3. 建立每个平台一条真实长会话演示和故障反馈模板，降低用户只说“不能用”的沟通成本。
4. 把购买、自动发码、激活诊断、退款说明连接成闭环。
5. 重点做 Obsidian、科研阅读、代码长对话复盘三个内容场景，而不是泛泛覆盖所有 AI 用户。

## 9. 证据置信度

- 本项目评分：仓库代码、README、manifest、测试和本地架构文档，置信度中高；真实商店用户留存和转化数据不可见。
- 竞品价格：官方定价页或 Chrome Web Store，置信度高；价格会变动，应在发布前复核。
- 竞品内部技术实现：只在公开文档明确说明时作为事实；其余只用于产品层比较，不反推其私有源码。

## 脚注

[^1]: [LunaTOC - Chrome Web Store](https://chromewebstore.google.com/detail/chatgpt-table-of-contents/ibfdglfgljonajofiiaonlimoiolkcpa)
[^2]: [Chat Collapse & Outline - Chrome Web Store](https://chromewebstore.google.com/detail/chat-collapse-outline-for/eidihfggclgebiapfehiddnjmfffelei)
[^3]: [Superpower ChatGPT Pricing](https://spchatgpt.com/pricing/)
[^4]: [Superpower ChatGPT Billing Terms](https://spchatgpt.com/terms-billing)
[^5]: [AI Toolbox Pricing](https://www.ai-toolbox.co/pricing)
[^6]: [AI Exporter Pricing](https://saveai.net/pricing)
[^7]: [AI Chat Exporter Pricing](https://www.ai-chat-exporter.com/en/pricing)
[^8]: [DeepShare - Chrome Web Store](https://chromewebstore.google.com/detail/deepshare-export-ai-chats/omnaecaamcabmnbjnpjpecoaalfgidop?hl=zh-TW)
[^9]: [ChatGPT Power Exporter](https://www.gptexport.tech/)
[^10]: [ChatHub Pricing](https://app.chathub.gg/pricing)
[^11]: [AI Chat Exporter 当前 Chrome Web Store 页面](https://chromewebstore.google.com/detail/ai-chat-exporter/eplnkdnnbmmijjadnabdefmjnjgapigm)
