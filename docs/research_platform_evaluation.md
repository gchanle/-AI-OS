# Research Platform Evaluation

Updated: 2026-03-26

## Goal

为 `AI 科研` 找一个可以尽快接入、同时对萤火虫有真实价值的开源科研平台。

## Bohrium Benchmark

Reference:

- [Bohrium](https://www.bohrium.com/)

### What Bohrium gets right

Bohrium 更像“科研空间站”而不是单点工具。它的价值不只在问答，而在于把这些能力放进一个连续工作流里：

- 学术检索
- 论文阅读与精读
- 数据/代码计算环境
- 团队协作与项目沉淀
- AI 助手贯穿检索、理解、实验、写作

### Why our current PaperHelper integration does not match it

PaperHelper 的定位更接近：

- 单论文阅读问答助手
- PDF + RAG 工具
- 引用辅助工具

它不具备 Bohrium 那种完整科研空间感：

- 没有项目工作台
- 没有统一资产沉淀
- 没有实验/计算环境
- 没有团队协作结构
- 没有科研任务流视图

结论：

PaperHelper 可以作为内部能力组件，但不应该直接作为面向用户的 `AI 科研大厅` 替代品。

## Candidate Comparison

### 1. PaperHelper

Repository:

- [JerryYin777/PaperHelper](https://github.com/JerryYin777/PaperHelper)

What it is:

- 面向论文阅读与问答的开源助手
- 以 PDF + RAG 为核心
- 更像“科研阅读助手”而不是完整科研操作系统

Why it was useful for internal evaluation:

- 仓库轻量，能在本地快速拉起
- 对 `AI 图书馆` 和 `AI 科研` 的交叉场景有直接价值
- 很容易和萤火虫形成联动

Work completed tonight:

- 已经拉取仓库到 `integrations/PaperHelper`
- 已安装依赖
- 已用 sample PDF 生成本地索引
- 已修复新版 LangChain 的关键兼容问题
- 已写好启动脚本 `integrations/PaperHelper/run.sh`
- 已在本地端口 `8501` 启动成功

Current integration status:

- 已作为内部可运行研究阅读助手拉起
- 当前地址：`http://localhost:8501`

Current limitations:

- 更偏“论文问答与阅读”，不是完整科研协作平台
- 现在使用本地 hash embedding，是为了快速可跑；后续需要更高质量 embedding
- 仍需进一步美化与和 Firefly 的深联动
- 不建议继续直接暴露在 `AI 科研大厅` 的正式平台切换中

### 2. OpenResearcher

Repository:

- [GAIR-NLP/OpenResearcher](https://github.com/GAIR-NLP/OpenResearcher)

What it is:

- 更完整、更强的 AI 科研助手
- 带 arXiv 检索、Qdrant、Elasticsearch、RAG 和 web search 能力

Why it is not the first overnight integration:

- 依赖重
- 需要 Qdrant、Elasticsearch、语料处理
- 启动链更长，今晚直接落地风险高

Best use:

- 第二阶段升级
- 当 `AI 科研` 真正从“工具入口”升级为“科研工作台”时接入

## Recommendation

### Immediate path

不要再把 `PaperHelper` 直接作为正式科研大厅暴露给用户。

更好的做法是：

- 先把它保留为内部研究阅读能力组件
- 萤火虫或图书馆需要“论文问答/精读/引用整理”时再调用它

### Phase 2 path

如果真要做出接近 Bohrium 的体验，优先路线不是继续拼外链，而是自建科研空间主壳：

- 检索层：OpenAlex / Crossref / Semantic Scholar / CNKI / 万方 / 校内资源
- 阅读层：PaperHelper 这类阅读器能力
- 研究任务层：Firefly 任务拆解、阶段推进、引用清单
- 结果层：笔记、综述、代码片段、表格与引用导出
- 计算层：后续再考虑接 Notebook / Sandbox

## Suggested AI 科研 Navigation Structure

建议 `AI 科研` 后续至少保留这些切换：

- 公司自有科研产品（闻道）
- 未来自建科研工作台
- 外部检索入口（OpenAlex / CNKI / 万方 / Semantic Scholar）

不建议把轻量阅读工具直接当成“科研大厅版本”去切换。

## How Firefly Should Link To Research Platforms

萤火虫不应该只停在“跳过去”。

更好的方式是三层联动：

1. Firefly 生成研究任务
2. 用户进入科研平台执行检索/阅读
3. 检索结果、笔记、引用再回流给 Firefly

## Firefly + PaperHelper Suggested Integration

### Query handoff

萤火虫把用户问题转换成：

- 检索问题
- 论文阅读任务
- 对比问题
- 引用整理任务

### Result return

从 PaperHelper 返回：

- 证据段落
- 论文片段
- 引用建议
- 阅读结论

### User value

这会让 `AI 科研` 从“外链工具堆”变成真正的研究闭环：

- 研究问题 -> 检索
- 检索 -> 阅读
- 阅读 -> 引用
- 引用 -> 汇报 / 写作 / 任务拆解

## Decision

## Final Recommendation

如果你的目标是接近 Bohrium 的“科研空间站”，最现实的判断是：

- 市面上没有一个成熟、轻量、开箱即用、且完全匹配你场景的开源整平台
- 直接套一个现成开源平台，大概率在品牌、流程、校园适配上都会很别扭
- 最稳的路线是“自己做科研平台主壳”，但吸收开源组件做底层能力

### Recommended build strategy

1. 自建 `AI 科研大厅` 主壳与任务流
2. 用 OpenAlex / Crossref 等开放检索接口补底层数据
3. 把 PaperHelper 类工具降级成内部能力，不做前台主平台
4. 把 OpenResearcher 作为后续深研究引擎候选，而不是今晚直接接入
