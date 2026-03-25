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

function decodeHtmlEntities(input = '') {
    return input
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripHtml(input = '') {
    return decodeHtmlEntities(
        input
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function normalizeUrl(url = '') {
    try {
        return decodeURIComponent(url);
    } catch {
        return url;
    }
}

function parseSearchResults(html = '') {
    const results = [];
    const resultRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = resultRegex.exec(html)) && results.length < 6) {
        const href = normalizeUrl(match[1]);
        const title = stripHtml(match[2]);
        if (!title || !href) {
            continue;
        }

        results.push({
            title,
            url: href,
            snippet: '',
        });
    }

    const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let snippetMatch;
    let index = 0;

    while ((snippetMatch = snippetRegex.exec(html)) && index < results.length) {
        results[index].snippet = stripHtml(snippetMatch[1]);
        index += 1;
    }

    return results;
}

async function searchWeb(query) {
    const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`search ${response.status}`);
    }

    const html = await response.text();
    return parseSearchResults(html);
}

async function fetchPageExcerpt(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        const text = stripHtml(html).slice(0, 900);
        return text || null;
    } catch {
        return null;
    }
}

async function buildResearchContext(query, deepResearch) {
    const results = await searchWeb(query);
    if (results.length === 0) {
        return '';
    }

    const baseLines = results.slice(0, deepResearch ? 5 : 4).map((item, index) => (
        `[${index + 1}] ${item.title}\n链接：${item.url}\n摘要：${item.snippet || '暂无摘要'}`
    ));

    if (!deepResearch) {
        return [
            '以下是联网搜索结果，请基于这些结果回答，并明确区分“搜索结果事实”与“你的推断”：',
            ...baseLines,
        ].join('\n\n');
    }

    const excerpts = await Promise.all(
        results.slice(0, 3).map(async (item, index) => {
            const excerpt = await fetchPageExcerpt(item.url);
            if (!excerpt) {
                return null;
            }

            return `深度研读 [${index + 1}] ${item.title}\n正文摘录：${excerpt}`;
        })
    );

    return [
        '以下是联网搜索和深度研读结果，请优先依据这些材料回答：',
        ...baseLines,
        ...excerpts.filter(Boolean),
    ].join('\n\n');
}

export async function POST(request) {
    try {
        const {
            messages,
            model,
            capabilityIds,
            webSearchEnabled = false,
            deepResearchEnabled = false,
        } = await request.json();

        if (!DASHSCOPE_API_KEY) {
            return NextResponse.json(
                { error: 'API key not configured' },
                { status: 500 }
            );
        }

        const resolvedModel = resolveChatModel(model);
        const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user')?.content || '';
        const researchContext = (webSearchEnabled || deepResearchEnabled) && latestUserMessage
            ? await buildResearchContext(latestUserMessage, deepResearchEnabled)
            : '';

        const systemPrompt = [
            BASE_SYSTEM_PROMPT,
            buildCapabilitySystemNote(capabilityIds),
            webSearchEnabled
                ? '当前会话已开启联网搜索，请优先基于搜索结果回答，并在结论里显式说明哪些信息来自搜索。'
                : '当前会话未开启联网搜索，除非用户提供来源，否则不要假装你拿到了实时网络信息。',
            deepResearchEnabled
                ? '当前会话已开启深度研究模式。请优先做结构化分析、交叉比对和来源梳理，不要只给一个简短结论。'
                : '',
        ].join('\n\n');

        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...(researchContext ? [{ role: 'system', content: researchContext }] : []),
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
