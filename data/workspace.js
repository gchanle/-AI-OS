import { buildCampusCapabilities } from '@/data/campusPlatform';

export const campusCapabilities = buildCampusCapabilities();

export const defaultCapabilityIds = ['services', 'research', 'assistant'];

export const capabilityMap = Object.fromEntries(
  campusCapabilities.map((item) => [item.id, item])
);

function parseModelCandidate(raw = '') {
  const parts = String(raw || '').split('|').map((item) => item.trim()).filter(Boolean);
  if (!parts.length) {
    return null;
  }

  const [id, label, summary] = parts;
  return {
    id,
    label: label || id,
    summary: summary || '本地覆盖模型',
  };
}

function loadEnvModelCandidates() {
  const raw = process.env.NEXT_PUBLIC_DASHSCOPE_MODEL_CANDIDATES || '';

  return raw
    .split(',')
    .map((item) => parseModelCandidate(item))
    .filter(Boolean);
}

const fallbackChatModelCandidates = [
  { id: 'firefly-general-demo', label: 'Firefly General Demo', summary: '默认演示模型' },
  { id: 'firefly-knowledge-demo', label: 'Firefly Knowledge Demo', summary: '长文与知识整理演示' },
  { id: 'firefly-reasoner-demo', label: 'Firefly Reasoner Demo', summary: '复杂推理演示' },
  { id: 'firefly-coder-demo', label: 'Firefly Coder Demo', summary: '代码与规划演示' },
  { id: 'firefly-lite-demo', label: 'Firefly Lite Demo', summary: '轻量响应演示' },
];

const envChatModelCandidates = loadEnvModelCandidates();

export const chatModelCandidates = envChatModelCandidates.length > 0
  ? envChatModelCandidates
  : fallbackChatModelCandidates;

export const chatModelOptions = chatModelCandidates;

export const defaultChatModelId = process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL_ID
  || chatModelCandidates[0]?.id
  || 'firefly-general-demo';

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
