export const libraryCollections = [
  { id: 'search', label: '智能检索', desc: '馆藏、论文、课程资料与数据库' },
  { id: 'plaza', label: '图书广场', desc: '推荐、搜索与发现图书资源' },
  { id: 'reading', label: '阅读', desc: '沉浸式阅读、AI 助手与笔记辅助' },
  { id: 'space', label: '个人空间', desc: '我的书架、我的笔记、阅读记录' },
];

export const libraryItems = [
  {
    id: 'ml-book-1',
    type: 'book',
    title: 'Pattern Recognition and Machine Learning',
    subtitle: '模式识别与机器学习经典教材',
    authors: ['Christopher M. Bishop'],
    year: 2006,
    source: '超星图书馆馆藏',
    callNo: 'TP181/B622',
    location: '总馆三层 A 区 12 架',
    availability: '可借 2 本',
    tags: ['机器学习', '概率图模型', '教材'],
    abstract: '面向机器学习课程与研究入门的经典教材，适合从概率视角搭建完整知识框架。',
    highlights: [
      '覆盖判别式与生成式模型',
      '适合课程阅读与科研查漏补缺',
      '可作为课程笔记与考试复习主线',
    ],
    citation: 'Bishop, C. M. Pattern Recognition and Machine Learning. Springer, 2006.',
    fireflyPrompt: '请基于《Pattern Recognition and Machine Learning》帮我生成一份适合机器学习课程复习的阅读路径，重点放在概率图模型与EM算法。',
  },
  {
    id: 'dl-paper-1',
    type: 'paper',
    title: 'Attention Is All You Need',
    subtitle: 'Transformer 架构原始论文',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
    year: 2017,
    source: '开放论文数据库',
    callNo: '在线资源',
    location: '电子全文可访问',
    availability: '全文在线',
    tags: ['Transformer', 'NLP', '深度学习'],
    abstract: '提出完全基于注意力机制的序列建模方法，为大语言模型和现代生成模型提供架构基础。',
    highlights: [
      '适合课程报告与综述写作',
      '常被引用于 AI 助教 与 AI 科研 场景',
      '支持导出 Firefly 阅读任务',
    ],
    citation: 'Vaswani, A., et al. Attention Is All You Need. NeurIPS, 2017.',
    fireflyPrompt: '请帮我围绕《Attention Is All You Need》做一份用于课堂汇报的 8 页 PPT 提纲，并额外列出和现代大模型的联系。',
  },
  {
    id: 'edu-report-1',
    type: 'report',
    title: '高校 AI 学习空间建设案例精选',
    subtitle: '校园 AI 应用、知识库与阅读空间建设',
    authors: ['超星研究院'],
    year: 2025,
    source: '校内特色资源',
    callNo: '专题报告',
    location: '特色馆藏专区',
    availability: '馆内阅览',
    tags: ['校园AI', '案例', '建设方案'],
    abstract: '整理校园 AI 空间、数字图书馆、课程资源整合与知识服务案例，适合产品规划与汇报引用。',
    highlights: [
      '适合 AI 图书馆 产品方案参考',
      '含馆藏、教学、科研三类场景',
      '可导出成 Firefly 产品分析任务',
    ],
    citation: '超星研究院. 高校 AI 学习空间建设案例精选, 2025.',
    fireflyPrompt: '请把《高校 AI 学习空间建设案例精选》整理成一份适合给领导汇报的产品机会分析，重点突出 AI 图书馆 和 萤火虫 的联动价值。',
  },
  {
    id: 'ir-book-1',
    type: 'book',
    title: 'Introduction to Information Retrieval',
    subtitle: '信息检索领域基础教材',
    authors: ['Christopher D. Manning', 'Prabhakar Raghavan', 'Hinrich Schütze'],
    year: 2008,
    source: '超星图书馆馆藏',
    callNo: 'G354.4/M286',
    location: '信息科学阅览区',
    availability: '可借 1 本',
    tags: ['信息检索', '搜索', '推荐'],
    abstract: '适合 AI 图书馆 检索体系设计与搜索逻辑建设，也适合课程基础学习。',
    highlights: [
      '对搜索、排序、索引设计有直接参考价值',
      '适合做 AI 图书馆 底层逻辑储备',
      '可辅助联网搜索与深度研究能力建设',
    ],
    citation: 'Manning, C. D., et al. Introduction to Information Retrieval. Cambridge University Press, 2008.',
    fireflyPrompt: '请基于《Introduction to Information Retrieval》帮我整理 AI 图书馆 的搜索系统设计要点，并转成产品功能清单。',
  },
];

export const libraryDatabases = [
  { id: 'chaoxing', name: '超星图书馆', desc: '馆藏、电子书、课程阅读资源', href: '/library' },
  { id: 'cnki', name: 'CNKI', desc: '中文期刊、学位论文、年鉴与工具书', href: 'https://www.cnki.net' },
  { id: 'wanfang', name: '万方数据', desc: '中文论文、会议、专利与科技报告', href: 'https://www.wanfangdata.com.cn' },
  { id: 'openalex', name: 'OpenAlex', desc: '开放学术图谱、作者与论文关系检索', href: 'https://openalex.org' },
];

export const libraryTasks = [
  {
    id: 'reading-plan',
    title: '生成阅读计划',
    desc: '按课程、考试或论文写作目标拆出阅读路径',
    prompt: '请基于我当前选中的图书或论文，帮我生成一个 2 周阅读计划，并拆成每天可以执行的阅读任务。',
  },
  {
    id: 'cite-summary',
    title: '整理引用摘要',
    desc: '抽取适合写综述与汇报使用的引用句和摘要',
    prompt: '请基于当前选中的文献，帮我提取 5 条适合写综述的引用点，并分别说明可用场景。',
  },
  {
    id: 'compare-related',
    title: '寻找相关文献',
    desc: '围绕当前主题补出同领域的相关资料',
    prompt: '请围绕当前文献主题，给我补 5 篇更适合做延伸阅读或综述对比的相关资料，并说明推荐理由。',
  },
];

export const borrowedItems = [
  { id: 'borrow-1', title: '数据库系统概论', due: '03-29', status: '即将到期' },
  { id: 'borrow-2', title: '统计学习方法', due: '04-08', status: '在借' },
];

export const readingHistory = [
  { id: 'history-1', title: 'Pattern Recognition and Machine Learning', progress: '读到 第 6 章', updatedAt: '昨晚 22:10' },
  { id: 'history-2', title: 'Attention Is All You Need', progress: '已摘录 5 条引用', updatedAt: '今天 09:20' },
];
