import { buildCampusCapabilities } from '@/data/campusPlatform';

export const campusCapabilities = buildCampusCapabilities();

export const defaultCapabilityIds = ['services', 'research', 'assistant'];

export const capabilityMap = Object.fromEntries(
  campusCapabilities.map((item) => [item.id, item])
);

export const chatModelCandidates = [
  { id: 'kimi-k2.5', label: 'KIMI 2.5', summary: '主对话默认' },
  { id: 'qwen3.5-plus', label: 'Qwen3.5 Plus', summary: '长文与多模态' },
  { id: 'qwen3-max-2026-01-23', label: 'Qwen3 Max', summary: '复杂任务与推理' },
  { id: 'qwen3-coder-next', label: 'Qwen3 Coder Next', summary: '编码与修复' },
  { id: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', summary: '代码与规划' },
  { id: 'MiniMax-M2.5', label: 'MiniMax M2.5', summary: '超长上下文' },
  { id: 'glm-5', label: 'GLM-5', summary: '推理与通用问答' },
  { id: 'glm-4.7', label: 'GLM-4.7', summary: '轻量推理' },
];

export const chatModelOptions = chatModelCandidates;

export const defaultChatModelId = 'kimi-k2.5';

export const chatModelMap = Object.fromEntries(
  chatModelCandidates.map((item) => [item.id, item])
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
