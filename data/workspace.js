export const campusCapabilities = [
  {
    id: 'services',
    name: 'AI 办事',
    source: '服务大厅',
    summary: '办理校园事务、审批流程、日程服务与一网通办入口',
  },
  {
    id: 'research',
    name: 'AI 科研',
    source: '闻道',
    summary: '科研探索、学术追踪、AI 研究员与知识服务',
  },
  {
    id: 'assistant',
    name: 'AI 助教',
    source: '超星泛雅',
    summary: '课程教学、作业协同、课堂互动与教学支持',
  },
  {
    id: 'library',
    name: 'AI 图书馆',
    source: '超星图书馆',
    summary: '馆藏检索、借阅服务、阅读支持与学习资源入口',
  },
  {
    id: 'agents',
    name: 'AI 智能体',
    source: 'AI 能力中心',
    summary: '智能体创建、校园能力编排与院系定制 AI 入口',
  },
];

export const defaultCapabilityIds = ['services', 'research', 'assistant'];

export const capabilityMap = Object.fromEntries(
  campusCapabilities.map((item) => [item.id, item])
);

export const chatModelOptions = [
  {
    id: 'kimi-k2.5',
    label: 'KIMI 2.5',
    summary: '主对话默认',
  },
  {
    id: 'qwen3-coder-plus',
    label: 'Qwen3 Coder Plus',
    summary: '代码与规划',
  },
];

export const chatModelCandidates = [
  { id: 'kimi-k2.5', label: 'KIMI 2.5', summary: '主对话默认' },
  { id: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', summary: '代码与规划' },
  { id: 'qwen-plus', label: 'Qwen Plus', summary: '通用增强' },
  { id: 'qwen-plus-latest', label: 'Qwen Plus Latest', summary: '通用增强' },
  { id: 'qwen-max', label: 'Qwen Max', summary: '复杂推理' },
  { id: 'qwen-max-latest', label: 'Qwen Max Latest', summary: '复杂推理' },
  { id: 'qwen-flash', label: 'Qwen Flash', summary: '快速响应' },
  { id: 'qwen3-max', label: 'Qwen3 Max', summary: '高阶推理' },
  { id: 'deepseek-r1', label: 'DeepSeek R1', summary: '深度思考' },
  { id: 'deepseek-v3', label: 'DeepSeek V3', summary: '通用推理' },
];

export const defaultChatModelId = 'kimi-k2.5';

export const chatModelMap = Object.fromEntries(
  chatModelOptions.map((item) => [item.id, item])
);

export function resolveChatModel(modelId) {
  if (chatModelMap[modelId]) {
    return chatModelMap[modelId];
  }

  if (modelId) {
    const fallbackCandidate = chatModelCandidates.find((item) => item.id === modelId);
    if (fallbackCandidate) {
      return fallbackCandidate;
    }

    return {
      id: modelId,
      label: modelId,
      summary: '自定义模型',
    };
  }

  return chatModelMap[defaultChatModelId];
}

export function sortCapabilityIds(ids = []) {
  const selected = new Set(ids);
  return campusCapabilities
    .filter((item) => selected.has(item.id))
    .map((item) => item.id);
}

export function buildCapabilitySystemNote(capabilityIds = []) {
  const resolvedCapabilities = sortCapabilityIds(capabilityIds)
    .map((id) => capabilityMap[id])
    .filter(Boolean);

  if (resolvedCapabilities.length === 0) {
    return '当前会话未显式接入校园系统能力。请基于通用校园场景回答，并明确说明无法调用实时系统数据。';
  }

  const capabilityLines = resolvedCapabilities
    .map((item) => `- ${item.name}：对应 ${item.source}，可提供${item.summary}`)
    .join('\n');

  return [
    '当前会话已接入以下校园能力：',
    capabilityLines,
    '回答时请优先围绕上述能力组织建议。',
    '如果用户问题需要未接入的系统，请直接说明当前尚未接入该能力，不要假装已经打通。',
    '如果没有拿到真实系统返回，就不要编造具体办事结果、课程数据或检索结果。',
  ].join('\n');
}

export const externalOpenModes = [
  { id: 'embed', label: '嵌入查看' },
  { id: 'current', label: '当前窗口' },
  { id: 'new-tab', label: '新标签' },
];
