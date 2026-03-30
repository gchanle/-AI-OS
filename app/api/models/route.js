import { NextResponse } from 'next/server';
import {
  chatModelCandidates,
  defaultChatModelId,
  resolveChatModel,
} from '@/data/workspace';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';

let cachedModels = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

function loadEnvCandidates() {
  const raw = process.env.DASHSCOPE_MODEL_CANDIDATES || '';

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [id, label] = item.split('|').map((part) => part.trim());
      const resolved = resolveChatModel(id);

      return {
        ...resolved,
        label: label || resolved.label,
      };
    });
}

async function probeModel(modelId) {
  const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      max_tokens: 8,
    }),
  });

  return response.ok;
}

export async function GET() {
  const probeCandidates = Array.from(
    new Map(
      [...chatModelCandidates, ...loadEnvCandidates()].map((candidate) => [candidate.id, candidate])
    ).values()
  );

  if (!DASHSCOPE_API_KEY) {
    return NextResponse.json({
      models: probeCandidates.length > 0
        ? probeCandidates
        : [resolveChatModel(defaultChatModelId)],
    });
  }

  if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ models: cachedModels });
  }

  const results = await Promise.all(
    probeCandidates.map(async (candidate) => ({
      candidate,
      supported: await probeModel(candidate.id).catch(() => false),
    }))
  );

  const supportedModels = results
    .filter((item) => item.supported)
    .map((item) => item.candidate);

  cachedModels = supportedModels.length > 0
    ? supportedModels
    : (probeCandidates.length > 0 ? probeCandidates : [resolveChatModel(defaultChatModelId)]);
  cachedAt = Date.now();

  return NextResponse.json({ models: cachedModels });
}
