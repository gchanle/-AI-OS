# Research Platform Evaluation

Updated: 2026-03-26

## Goal

为 `AI 科研` 找一个可以尽快接入、同时对萤火虫有真实价值的开源科研平台。

## Candidate Comparison

### 1. PaperHelper

Repository:

- [JerryYin777/PaperHelper](https://github.com/JerryYin777/PaperHelper)

What it is:

- 面向论文阅读与问答的开源助手
- 以 PDF + RAG 为核心
- 更像“科研阅读助手”而不是完整科研操作系统

Why it is a good fit now:

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

- 已在 `AI 科研` 左侧导航新增 `PaperHelper`
- 当前地址：`http://localhost:8501`

Current limitations:

- 更偏“论文问答与阅读”，不是完整科研协作平台
- 现在使用本地 hash embedding，是为了快速可跑；后续需要更高质量 embedding
- 仍需进一步美化与和 Firefly 的深联动

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

先接 `PaperHelper`，原因：

- 今晚已经跑起来
- 对用户有可见价值
- 能和 `AI 图书馆`、萤火虫形成联动

### Phase 2 path

把 `OpenResearcher` 作为进阶平台：

- 当你愿意投入更多算力和检索基础设施时再上
- 届时可以作为 `AI 科研` 中“深研究平台”一栏

## Suggested AI 科研 Navigation Structure

建议 `AI 科研` 后续至少保留这些切换：

- 公司自有科研产品
- PaperHelper
- OpenResearcher（后续）
- OpenAlex / CNKI / 万方 等外部检索入口

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

今晚优先路线已经明确：

- 已接入并跑通：PaperHelper
- 长期升级候选：OpenResearcher
