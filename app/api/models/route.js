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
  if (!DASHSCOPE_API_KEY) {
    return NextResponse.json({
      models: [resolveChatModel(defaultChatModelId)],
    });
  }

  if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ models: cachedModels });
  }

  const results = await Promise.all(
    chatModelCandidates.map(async (candidate) => ({
      candidate,
      supported: await probeModel(candidate.id).catch(() => false),
    }))
  );

  const supportedModels = results
    .filter((item) => item.supported)
    .map((item) => item.candidate);

  cachedModels = supportedModels.length > 0
    ? supportedModels
    : [resolveChatModel(defaultChatModelId)];
  cachedAt = Date.now();

  return NextResponse.json({ models: cachedModels });
}
