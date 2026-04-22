import { NextResponse } from 'next/server';
import { buildCapabilitySystemNote, defaultChatModelId, resolveChatModel } from '@/data/workspace';
import { shouldUseWebSearch } from '@/lib/fireflyResponseMode';
import {
    buildWebAnswer,
    searchWeb as searchWebService,
    readWebResults,
} from '@/services/fireflyWebSearchService';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
const DASHSCOPE_TIMEOUT_MS = 45000;

const BASE_SYSTEM_PROMPT = `你是"萤火虫"，超星 AI 校园 OS 的工作助手。你的职责是帮助师生组织校园事务、学习任务、科研问题和系统上下文。

你的特点：
- 友好、专业、有耐心
- 默认使用克制、清晰、专业的中文表达
- 回答简洁明了，条理清晰，优先帮助用户推进事情
- 涉及学术问题时给出结构化分析和可执行建议
- 如果不确定的信息，会诚实告知
- 优先把信息整理成步骤、任务、提醒或可执行建议，而不是空泛描述
- 如果用户只是寒暄、打招呼，简短回应即可，不要主动介绍全部能力
- 如果用户问“你是谁”，先用一句话说明身份；只有用户继续追问“你能做什么”时，才展开能力范围
- 默认不要过度热情，不要在用户没要求时一次性罗列完整功能清单

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

function extractSourceLabel(title = '', url = '') {
    const normalizedTitle = String(title || '').trim();
    const knownSourceMatch = normalizedTitle.match(/央视新闻|央视网|新华社|人民日报|澎湃新闻|界面新闻|财联社|新浪新闻|网易新闻|腾讯新闻|凤凰网|观察者网|BBC News 中文|BBC|纽约时报中文网|纽约时报|华尔街日报|路透社|Reuters|美联社|AP News|CNBC|Bloomberg|彭博社|The Paper|VOA|美国之音/);
    if (knownSourceMatch) {
        return knownSourceMatch[0];
    }

    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        if (/news\.cctv\.com|cctv\.com/.test(hostname)) return '央视新闻';
        if (/xinhuanet\.com/.test(hostname)) return '新华社';
        if (/people\.com\.cn/.test(hostname)) return '人民日报';
        if (/thepaper\.cn/.test(hostname)) return '澎湃新闻';
        if (/bbc\.com/.test(hostname)) return 'BBC';
        if (/nytimes\.com/.test(hostname)) return '纽约时报';
        if (/reuters\.com/.test(hostname)) return '路透社';
        if (/apnews\.com/.test(hostname)) return '美联社';
        if (/voachinese\.com|voa.*\.com/.test(hostname)) return '美国之音';
        if (/sina\.com\.cn/.test(hostname)) return '新浪新闻';
        if (/163\.com/.test(hostname)) return '网易新闻';
        if (/qq\.com/.test(hostname)) return '腾讯新闻';
        if (/ifeng\.com/.test(hostname)) return '凤凰网';
        return hostname;
    } catch {
        return normalizedTitle || '来源';
    }
}

function normalizeUrl(url = '') {
    try {
        const resolved = url.startsWith('//') ? `https:${url}` : url;
        const parsed = new URL(resolved, 'https://duckduckgo.com');
        const redirectedTarget = parsed.searchParams.get('uddg');
        if (redirectedTarget) {
            return decodeURIComponent(redirectedTarget);
        }
        return parsed.toString();
    } catch {
        try {
            return decodeURIComponent(url);
        } catch {
            return url;
        }
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

function buildSearchQueries(query = '') {
    const normalized = String(query || '').trim();
    if (!normalized) {
        return [];
    }

    const hasExplicitTime = /20\d{2}|今年|本月|本周|最近|最新|今天|今日|本周|本月|当前|目前|刚刚|实时|近况|进展|局势|动态|新闻/.test(normalized);
    const isNewsLike = /新闻|局势|动态|进展|现状|近况|战况|冲突|制裁|政策|发布会|回应|声明|通报|消息|快讯|头条|热点/.test(normalized);
    const isTimelineLike = /什么时候|哪一年|哪天|最后一次|最后|合拍|完结|首播|上映|发布|成立|去世|出生|时间线/.test(normalized);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentDay = new Date().getDate();
    const queries = [
        normalized,
        hasExplicitTime ? `${normalized} ${currentYear}` : `${normalized} 最新`,
        isNewsLike
            ? `${normalized} ${currentYear}年${currentMonth}月${currentDay}日`
            : isTimelineLike
                ? `${normalized} 时间`
                : `${normalized} ${currentYear}年${currentMonth}月 最新`,
        isNewsLike ? `${normalized} 路透社 OR 新华社 OR 央视新闻` : '',
    ].filter(Boolean);

    return queries.filter((item, index) => queries.indexOf(item) === index).slice(0, 3);
}

function buildSourceTrustScore(item = {}, query = '') {
    const title = String(item?.title || '').toLowerCase();
    const url = String(item?.url || '').toLowerCase();
    const normalizedQuery = String(query || '').toLowerCase();
    let score = 0;

    if (/openai\.com/.test(url)) score += 12;
    if (/news\.openai\.com|openai\.com\/index|openai\.com\/blog/.test(url)) score += 6;
    if (/reuters\.com|apnews\.com|bloomberg\.com|wsj\.com|ft\.com|theverge\.com|techcrunch\.com|wired\.com|cnbc\.com|bbc\.com|nytimes\.com|xinhuanet\.com|people\.com\.cn|cctv\.com/.test(url)) score += 5;
    if (/zhihu\.com|sohu\.com|163\.com\/dy|baijiahao|toutiao|mp\.weixin|csdn\.net|juejin|36kr/.test(url)) score -= 4;
    if (/博客|专栏|问答|论坛|社区|知道|贴吧/.test(title)) score -= 2;
    if (/官方|发布|launch|announcement|introducing|news/.test(title)) score += 2;
    if (/openai|gpt|chatgpt|sora|api/.test(normalizedQuery) && /openai|gpt|chatgpt|sora|api/.test(title)) score += 2;

    return score;
}

function rankSearchResults(results = [], query = '') {
    return [...results].sort((left, right) => {
        const scoreDelta = buildSourceTrustScore(right, query) - buildSourceTrustScore(left, query);
        if (scoreDelta !== 0) {
            return scoreDelta;
        }
        return Number(left.rank || 0) - Number(right.rank || 0);
    });
}

function filterSearchResults(results = [], query = '') {
    const normalizedQuery = String(query || '').toLowerCase();
    const requiresHighTrust = /openai|chatgpt|gpt|sora|苹果|apple|谷歌|google|meta|特斯拉|tesla|发布|官宣|announcement|launch|最新产品/i.test(normalizedQuery);
    if (!requiresHighTrust) {
        return results;
    }

    const filtered = results.filter((item) => buildSourceTrustScore(item, query) >= 0);
    return filtered.length >= 2 ? filtered : results;
}

function shouldUseGroundedWebAnswer(question = '') {
    const normalized = String(question || '').trim();
    if (!normalized) {
        return false;
    }

    return /openai|chatgpt|gpt|sora|苹果|apple|谷歌|google|meta|字节|bytedance|特斯拉|tesla|发布|发布了|上线|推出|官宣|announcement|launch|latest product|最新产品|最新发布/i.test(normalized);
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
    const searchQueries = buildSearchQueries(query);
    const mergedResults = [];

    for (const candidateQuery of searchQueries) {
        const batch = await searchWebService(candidateQuery, { limit: deepResearch ? 6 : 5 });
        for (const item of batch) {
            if (mergedResults.some((existing) => existing.url === item.url || existing.title === item.title)) {
                continue;
            }
            mergedResults.push(item);
        }
        if (mergedResults.length >= (deepResearch ? 6 : 4)) {
            break;
        }
    }

    const results = filterSearchResults(rankSearchResults(mergedResults, query), query);
    if (results.length === 0) {
        return {
            prompt: '',
            sources: [],
            fetchedCount: 0,
            fetchedPages: [],
        };
    }

    const selectedResults = results.slice(0, deepResearch ? 5 : 4);
    const sources = selectedResults.map((item, index) => ({
        index: index + 1,
        title: item.title,
        url: item.url,
        label: extractSourceLabel(item.title, item.url),
        snippet: item.snippet || '',
        sourceId: item.sourceId || `web-${index + 1}`,
        rank: item.rank || index + 1,
    }));
    const baseLines = sources.map((item) => (
        `[${item.index}] ${item.title}\n来源： [${item.label}](${item.url})\n链接：${item.url}\n摘要：${item.snippet || '暂无摘要'}`
    ));

    const excerptBundle = await readWebResults(
        selectedResults.map((item) => ({
            ...item,
            sourceId: item.sourceId || `web-${item.rank || 0 || 1}`,
        })),
        {
            maxPages: deepResearch ? 3 : 2,
            excerptLimit: deepResearch ? 1400 : 900,
        }
    );
    const resolvedExcerpts = excerptBundle.pages
        .slice(0, deepResearch ? 3 : 2)
        .map((item, index) => `网页摘录 [${index + 1}] ${item.title}\n正文摘录：${item.excerpt}`);

    if (!deepResearch) {
        return {
            prompt: [
                '以下是联网搜索结果与网页摘录，请基于这些材料回答，并明确区分“搜索结果事实”与“你的推断”。凡是写“来源”时，必须使用 Markdown 超链接格式，例如 来源：[央视新闻](https://example.com)：',
                ...baseLines,
                ...resolvedExcerpts,
            ].join('\n\n'),
            sources,
            fetchedCount: resolvedExcerpts.length,
            fetchedPages: excerptBundle.pages,
        };
    }

    return {
        prompt: [
            '以下是联网搜索和深度研读结果，请优先依据这些材料回答。凡是写“来源”时，必须使用 Markdown 超链接格式，例如 来源：[央视新闻](https://example.com)：',
            ...baseLines,
            ...resolvedExcerpts,
        ].join('\n\n'),
        sources,
        fetchedCount: resolvedExcerpts.length,
        fetchedPages: excerptBundle.pages,
    };
}

function normalizeSourcePayload(sources = []) {
    return Array.isArray(sources)
        ? sources
            .filter((item) => item?.title && item?.url)
            .slice(0, 6)
            .map((item, index) => ({
                id: `source-${index + 1}`,
                kind: 'web',
                title: item.title,
                label: item.label || extractSourceLabel(item.title, item.url),
                url: item.url,
                order: index + 1,
            }))
        : [];
}

export async function POST(request) {
    try {
        const {
            messages,
            originalQuestion = '',
            model,
            capabilityIds,
            webSearchEnabled = false,
            deepResearchEnabled = false,
            userName = '',
        } = await request.json();

        if (!DASHSCOPE_API_KEY) {
            return NextResponse.json(
                { error: 'API key not configured' },
                { status: 500 }
            );
        }

        const requestedModel = resolveChatModel(model);
        const fallbackModel = resolveChatModel(defaultChatModelId);
        const resolvedModel = requestedModel?.id ? requestedModel : fallbackModel;
        const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user')?.content || '';
        const trimmedLatestUserMessage = String(latestUserMessage || '').trim();
        const trimmedOriginalQuestion = String(originalQuestion || '').trim();
        const searchDecisionQuestion = trimmedOriginalQuestion || trimmedLatestUserMessage;
        const effectiveWebSearchEnabled = shouldUseWebSearch(searchDecisionQuestion, {
            webSearchEnabled,
            deepResearchEnabled,
        });
        const userProfileNote = String(userName || '').trim()
            ? `当前用户姓名：${String(userName).trim()}。如果只是打招呼，可自然称呼对方，但不要每次都重复名字。`
            : '';
        const greetingModeNote = /^(你好|您好|嗨|hi|hello|晚上好|早上好|下午好|在吗)[!！。,. ]*$/i.test(trimmedLatestUserMessage)
            ? '当前用户只是简短打招呼。请只回一句简短问候，不要主动介绍功能。'
            : /^(你是谁|你是干嘛的|你能做什么|介绍一下你自己)[?？!！。 ]*$/i.test(trimmedLatestUserMessage)
                ? '当前用户在问你的身份。请先用一两句话说明你是校园工作助手；除非用户明确追问功能细节，否则不要展开完整能力清单。'
                : '';

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                const send = (payload) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                };

                try {
                    let researchBundle = { prompt: '', sources: [], fetchedCount: 0 };
                    let groundedAnswer = '';

                    if ((effectiveWebSearchEnabled || deepResearchEnabled) && searchDecisionQuestion) {
                        send({
                            type: 'status',
                            stage: 'search_started',
                            title: deepResearchEnabled ? '正在规划研究路径' : '正在搜索来源',
                            summary: deepResearchEnabled
                                ? '先锁定来源，再读取关键内容。'
                                : '正在寻找可引用的网页来源。',
                        });
                        researchBundle = await buildResearchContext(searchDecisionQuestion, deepResearchEnabled);
                        send({
                            type: 'status',
                            stage: 'sources_ready',
                            title: '已锁定候选来源',
                            summary: researchBundle.fetchedCount > 0
                                ? `已找到 ${researchBundle.sources.length} 个来源，并读取了 ${researchBundle.fetchedCount} 个页面摘录。`
                                : `已找到 ${researchBundle.sources.length} 个来源，正在整理为可读结论。`,
                            sourceCount: researchBundle.sources.length,
                            fetchedCount: researchBundle.fetchedCount || 0,
                        });

                        if (effectiveWebSearchEnabled && !deepResearchEnabled && shouldUseGroundedWebAnswer(searchDecisionQuestion)) {
                            const grounded = await buildWebAnswer({
                                question: searchDecisionQuestion,
                                searchResults: researchBundle.sources,
                                fetchedPages: Array.isArray(researchBundle.fetchedPages) ? researchBundle.fetchedPages : [],
                            }).catch(() => null);

                            groundedAnswer = String(grounded?.answer || '').trim();
                        }
                    } else {
                        send({
                            type: 'status',
                            stage: 'thinking',
                            title: '正在组织回答',
                            summary: '我先判断问题意图，再生成最终回复。',
                        });
                    }

                    const systemPrompt = [
                        BASE_SYSTEM_PROMPT,
                        buildCapabilitySystemNote(capabilityIds),
                        userProfileNote,
                        greetingModeNote,
                        effectiveWebSearchEnabled
                            ? '当前会话允许联网搜索，并且本轮问题已经命中联网检索。请优先基于搜索结果回答，在结论里显式说明哪些信息来自搜索；凡是写“来源”时，必须把来源名称写成 Markdown 超链接。既然已经拿到了搜索结果，就不要再说“无法联网”“无法获取实时信息”“无法接入实时新闻系统”或“我没有上网查询”。'
                            : '当前会话未开启联网搜索，除非用户提供来源，否则不要假装你拿到了实时网络信息。',
                        deepResearchEnabled
                            ? '当前会话已开启深度研究模式。请优先做结构化分析、交叉比对和来源梳理，不要只给一个简短结论。'
                            : '',
                        researchBundle.prompt || '',
                    ].join('\n\n');

                    const fullMessages = [
                        { role: 'system', content: systemPrompt },
                        ...messages,
                    ];

                    send({
                        type: 'status',
                        stage: 'answer_started',
                        title: effectiveWebSearchEnabled || deepResearchEnabled ? '正在整理回答' : '正在生成回答',
                        summary: effectiveWebSearchEnabled || deepResearchEnabled
                            ? '已拿到可用来源，正在压缩成最终答案。'
                            : '正在把结论组织成适合阅读的回复。',
                        sourceCount: researchBundle.sources.length,
                        fetchedCount: researchBundle.fetchedCount || 0,
                    });

                    if (groundedAnswer) {
                        send({ content: groundedAnswer });
                        const sourcePayload = normalizeSourcePayload(researchBundle.sources);
                        if (sourcePayload.length > 0) {
                            send({
                                type: 'sources',
                                sources: sourcePayload,
                            });
                        }
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        return;
                    }

                    let response = await fetchDashScopeChatCompletion({
                        model: resolvedModel.id,
                        messages: fullMessages,
                        stream: true,
                        temperature: 0.7,
                        max_tokens: 2048,
                    });

                    if (!response.ok && resolvedModel.id !== fallbackModel.id) {
                        response = await fetchDashScopeChatCompletion({
                            model: fallbackModel.id,
                            messages: fullMessages,
                            stream: true,
                            temperature: 0.7,
                            max_tokens: 2048,
                        });
                    }

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('DashScope API error:', response.status, errorText);
                        send({
                            type: 'error',
                            error: `API error: ${response.status}`,
                        });
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        return;
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let streamedContent = '';

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
                                continue;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    streamedContent += content;
                                    send({ content });
                                }
                            } catch {
                                // skip malformed JSON
                            }
                        }
                    }

                    const sourcePayload = effectiveWebSearchEnabled || deepResearchEnabled
                        ? normalizeSourcePayload(researchBundle.sources)
                        : [];
                    if (sourcePayload.length > 0) {
                        send({
                            type: 'sources',
                            sources: sourcePayload,
                        });
                    }
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } catch (err) {
                    console.error('Stream error:', err);
                    send({
                        type: 'error',
                        error: err instanceof Error ? err.message : '聊天流式输出失败',
                    });
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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

async function fetchDashScopeChatCompletion(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DASHSCOPE_TIMEOUT_MS);

    try {
        return await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('模型响应超时，请稍后重试');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
