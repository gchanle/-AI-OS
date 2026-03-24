import { NextResponse } from 'next/server';
import { buildCapabilitySystemNote, resolveChatModel } from '@/data/workspace';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';

const BASE_SYSTEM_PROMPT = `你是"萤火虫"，超星 AI 校园 OS 的工作助手。你的职责是帮助师生组织校园事务、学习任务、科研问题和系统上下文。

你的特点：
- 友好、专业、有耐心
- 默认使用克制、清晰、专业的中文表达
- 回答简洁明了，条理清晰，优先帮助用户推进事情
- 涉及学术问题时给出结构化分析和可执行建议
- 如果不确定的信息，会诚实告知
- 优先把信息整理成步骤、任务、提醒或可执行建议，而不是空泛描述

你可以帮助的领域包括：
- 课程学习与考试辅导
- 论文写作与学术研究
- 校园服务与办事指南
- 选课建议与学业规划
- 科研项目与文献查找
- 创新创业与竞赛指导`;

export async function POST(request) {
    try {
        const { messages, model, capabilityIds } = await request.json();

        if (!DASHSCOPE_API_KEY) {
            return NextResponse.json(
                { error: 'API key not configured' },
                { status: 500 }
            );
        }

        const resolvedModel = resolveChatModel(model);
        const systemPrompt = [
            BASE_SYSTEM_PROMPT,
            buildCapabilitySystemNote(capabilityIds),
        ].join('\n\n');

        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages,
        ];

        const modelToUse = resolvedModel.id;

        const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: fullMessages,
                stream: true,
                temperature: 0.7,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DashScope API error:', response.status, errorText);
            return NextResponse.json(
                { error: `API error: ${response.status}` },
                { status: response.status }
            );
        }

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || !trimmed.startsWith('data: ')) continue;

                            const data = trimmed.slice(6);
                            if (data === '[DONE]') {
                                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                continue;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    controller.enqueue(
                                        encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                                    );
                                }
                            } catch {
                                // skip malformed JSON
                            }
                        }
                    }
                } catch (err) {
                    console.error('Stream error:', err);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
