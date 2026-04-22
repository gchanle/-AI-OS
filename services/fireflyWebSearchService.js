import { resolveChatModel } from '@/data/workspace';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';

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
        const decoded = decodeURIComponent(url);
        const normalized = decoded.startsWith('//') ? `https:${decoded}` : decoded;
        const parsed = new URL(normalized);
        const redirectTarget = parsed.searchParams.get('uddg') || parsed.searchParams.get('u');
        if (redirectTarget) {
            return decodeURIComponent(redirectTarget);
        }
        return normalized;
    } catch {
        return url;
    }
}

function parseSearchResults(html = '', limit = 6) {
    const results = [];
    const resultRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = resultRegex.exec(html)) && results.length < limit) {
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

export async function searchWeb(query = '', options = {}) {
    const limit = Math.max(1, Number(options.limit || 6));
    const normalizedQuery = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!normalizedQuery) {
        return [];
    }

    const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`search ${response.status}`);
    }

    const html = await response.text();
    return attachSourceIds(parseSearchResults(html, limit), 'web');
}

export async function fetchPageExcerpt(url = '', limit = 1200) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        const text = stripHtml(html).slice(0, limit);
        return text || null;
    } catch {
        return null;
    }
}

function uniqueByUrl(results = []) {
    const seen = new Set();
    return results.filter((item) => {
        const url = String(item?.url || '').trim();
        if (!url || seen.has(url)) {
            return false;
        }
        seen.add(url);
        return true;
    });
}

function attachSourceIds(results = [], prefix = 'source') {
    return results.map((item, index) => ({
        ...item,
        sourceId: `${prefix}-${index + 1}`,
        rank: index + 1,
    }));
}

function buildCitationRecords(searchResults = [], fetchedPages = []) {
    const fetchedBySourceId = new Map(
        fetchedPages
            .filter(Boolean)
            .map((item) => [String(item.sourceId || '').trim(), item])
            .filter(([key]) => key)
    );

    return searchResults.map((item, index) => {
        const sourceId = String(item?.sourceId || `source-${index + 1}`).trim();
        const fetched = fetchedBySourceId.get(sourceId) || null;

        return {
            sourceId,
            citationLabel: `[${index + 1}]`,
            title: item.title,
            url: item.url,
            snippet: item.snippet || '',
            researchQuery: item.researchQuery || '',
            groundedBy: fetched ? 'page_excerpt' : 'search_snippet',
            excerpt: fetched?.excerpt || '',
        };
    });
}

function splitAnswerParagraphs(answer = '') {
    const lines = String(answer || '').replace(/\r/g, '').split('\n');
    const paragraphs = [];
    let buffer = [];
    let paragraphIndex = 0;

    const flushBuffer = () => {
        const content = buffer.join('\n').trim();
        if (!content) {
            buffer = [];
            return;
        }

        paragraphIndex += 1;
        paragraphs.push({
            id: `p${paragraphIndex}`,
            text: content,
        });
        buffer = [];
    };

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            flushBuffer();
            return;
        }

        if (/^#{1,6}\s/.test(trimmed)) {
            flushBuffer();
            paragraphIndex += 1;
            paragraphs.push({
                id: `p${paragraphIndex}`,
                text: trimmed,
            });
            return;
        }

        buffer.push(trimmed);
    });

    flushBuffer();
    return paragraphs;
}

function extractCitationLabels(text = '') {
    return Array.from(String(text || '').matchAll(/\[(\d+)\]/g)).map((match) => `[${match[1]}]`);
}

export function buildAnswerTrace(answer = '', citations = []) {
    const normalizedCitations = Array.isArray(citations) ? citations : [];
    const citationByLabel = new Map(
        normalizedCitations.map((item) => [String(item.citationLabel || '').trim(), item]).filter(([key]) => key)
    );
    const paragraphs = splitAnswerParagraphs(answer);
    const paragraphTrace = paragraphs.map((paragraph) => {
        const labels = Array.from(new Set(extractCitationLabels(paragraph.text)));
        const matchedCitations = labels
            .map((label) => citationByLabel.get(label))
            .filter(Boolean);
        const sourceIds = Array.from(new Set(matchedCitations.map((item) => String(item.sourceId || '').trim()).filter(Boolean)));

        return {
            paragraphId: paragraph.id,
            text: paragraph.text,
            citationLabels: labels,
            sourceIds,
            citationCount: matchedCitations.length,
            grounded: matchedCitations.length > 0,
            missingCitationLabels: labels.filter((label) => !citationByLabel.has(label)),
        };
    });

    const sourceTrace = normalizedCitations.map((citation) => {
        const sourceId = String(citation.sourceId || '').trim();
        const linkedParagraphs = paragraphTrace.filter((item) => item.sourceIds.includes(sourceId));
        return {
            sourceId,
            citationLabel: citation.citationLabel,
            title: citation.title,
            url: citation.url,
            paragraphIds: linkedParagraphs.map((item) => item.paragraphId),
            paragraphCount: linkedParagraphs.length,
        };
    });

    const unmatchedCitationLabels = Array.from(
        new Set(paragraphTrace.flatMap((item) => item.missingCitationLabels || []).filter(Boolean))
    );
    const usedSourceIds = new Set(paragraphTrace.flatMap((item) => item.sourceIds || []).filter(Boolean));
    const unusedSources = normalizedCitations
        .filter((item) => {
            const sourceId = String(item.sourceId || '').trim();
            return sourceId && !usedSourceIds.has(sourceId);
        })
        .map((item) => ({
            sourceId: item.sourceId,
            citationLabel: item.citationLabel,
            title: item.title,
            url: item.url,
        }));

    return {
        paragraphs: paragraphTrace,
        sourceTrace,
        validation: {
            paragraphCount: paragraphTrace.length,
            citedParagraphCount: paragraphTrace.filter((item) => item.grounded).length,
            uncitedParagraphCount: paragraphTrace.filter((item) => !item.grounded).length,
            unmatchedCitationLabels,
            unusedSourceCount: unusedSources.length,
            unusedSources,
        },
    };
}

export function buildResearchBundle({
    question = '',
    searchResults = [],
    fetchedPages = [],
    failedPages = [],
    queries = [],
    answer = '',
    groundedBy = '',
    mode = 'web',
    answerTrace = null,
    traceValidation = null,
    sourceTrace = [],
} = {}) {
    return {
        mode,
        question,
        groundedBy,
        generatedAt: new Date().toISOString(),
        queries,
        citations: buildCitationRecords(searchResults, fetchedPages),
        sources: searchResults.map((item) => ({
            sourceId: item.sourceId || '',
            rank: Number(item.rank || 0),
            title: item.title,
            url: item.url,
            snippet: item.snippet || '',
            researchQuery: item.researchQuery || '',
        })),
        fetchedPages: fetchedPages.map((item) => ({
            sourceId: item.sourceId || '',
            title: item.title,
            url: item.url,
            researchQuery: item.researchQuery || '',
            excerpt: item.excerpt || '',
        })),
        failedPages: failedPages.map((item) => ({
            sourceId: item.sourceId || '',
            title: item.title,
            url: item.url,
            researchQuery: item.researchQuery || '',
        })),
        answer,
        answerTrace: Array.isArray(answerTrace) ? answerTrace : [],
        traceValidation: traceValidation && typeof traceValidation === 'object' ? traceValidation : null,
        sourceTrace: Array.isArray(sourceTrace) ? sourceTrace : [],
    };
}

function buildDeepResearchQueries(question = '') {
    const seed = String(question || '').trim();
    if (!seed) {
        return [];
    }

    const queries = [
        seed,
        `${seed} 官方`,
        `${seed} 背景`,
        `${seed} 最新 进展`,
    ];

    if (/谁|人物|创始人|CEO|作者|主演|导师/.test(seed)) {
        queries.push(`${seed} 经历`);
    }

    if (/为什么|原因|争议|影响|评价/.test(seed)) {
        queries.push(`${seed} 分析`);
    }

    if (/什么时候|时间|日期|最近|最新|发布|上线|首播|上映/.test(seed)) {
        queries.push(`${seed} 时间线`);
    }

    return Array.from(new Set(queries)).slice(0, 5);
}

export async function searchWebDeep(question = '', options = {}) {
    const queries = buildDeepResearchQueries(question);
    const perQueryLimit = Math.max(3, Number(options.perQueryLimit || 4));
    const maxResults = Math.max(6, Number(options.maxResults || 12));
    const settled = await Promise.all(
        queries.map(async (query) => {
            const results = await searchWeb(query, { limit: perQueryLimit });
            return results.map((item) => ({
                ...item,
                researchQuery: query,
            }));
        })
    );

    return {
        queries,
        results: attachSourceIds(uniqueByUrl(settled.flat()).slice(0, maxResults), 'research'),
    };
}

export async function readWebResults(results = [], options = {}) {
    const maxPages = Math.max(1, Number(options.maxPages || 5));
    const excerptLimit = Math.max(600, Number(options.excerptLimit || 1600));
    const attempts = await Promise.all(
        results.slice(0, maxPages).map(async (item) => ({
            title: item.title,
            url: item.url,
            sourceId: item.sourceId || '',
            rank: Number(item.rank || 0),
            researchQuery: item.researchQuery || '',
            snippet: item.snippet || '',
            excerpt: await fetchPageExcerpt(item.url, excerptLimit),
        }))
    );

    return {
        pages: attempts.filter((item) => item.excerpt),
        failedPages: attempts.filter((item) => !item.excerpt),
    };
}

export async function buildWebAnswer({
    question = '',
    searchResults = [],
    fetchedPages = [],
    instructions = '',
}) {
    if (!DASHSCOPE_API_KEY) {
        throw new Error('API key not configured');
    }

    const agentConfig = loadAdminAgentRuntimeConfig();
    const modelId = resolveChatModel(agentConfig.models?.primaryModelId).id;
    const sourceLines = searchResults.slice(0, 5).map((item, index) => (
        `[${index + 1}] ${item.title}\nsource_id：${item.sourceId || `web-${index + 1}`}\n链接：${item.url}\n摘要：${item.snippet || '暂无摘要'}`
    ));
    const pageLines = fetchedPages.slice(0, 3).map((item, index) => (
        `正文摘录 [${index + 1}] ${item.title}\nsource_id：${item.sourceId || `web-${index + 1}`}\n${item.excerpt || '未能提取正文'}`
    ));

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
            model: modelId,
            stream: false,
            temperature: 0.2,
            max_tokens: 900,
            messages: [
                {
                    role: 'system',
                    content: [
                        '你是萤火虫的联网回答器。',
                        '请基于给定搜索结果和网页摘录，直接回答用户问题。',
                        '回答要求：',
                        '- 用简洁、结构化中文回答',
                        '- 明确区分结论与来源',
                        '- 在正文关键结论后尽量标注引用编号，例如 [1]、[2]',
                        '- 引用编号必须对应下面给出的搜索结果编号，不能自造编号',
                        '- 如果时间信息涉及中美时区差异，简要说明',
                        '- 不要编造未在材料中出现的事实',
                        '- 对“今天发布了什么/最新发布/刚发布”这类问题，如果材料里没有直接证据指向官方或主流媒体确认的发布时间与产品名，必须明确说“暂未找到足够可信来源支持该结论”',
                        '- 如果搜索结果之间相互矛盾，优先采用官方来源；若仍无法确定，就输出“信息不足，暂不下结论”',
                        '- 不要在正文末尾再重复写完整“来源”清单，来源清单会由系统附加',
                        '- 如果材料不足以确定答案，要明确说信息不足',
                        instructions ? `- 额外执行要求：${instructions}` : '',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: [
                        `问题：${question}`,
                        instructions ? `前台接管说明：${instructions}` : '',
                        '',
                        '搜索结果：',
                        ...sourceLines,
                        '',
                        '网页摘录：',
                        ...pageLines,
                    ].join('\n'),
                },
            ],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`web-answer ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim() || '';
    const citations = buildCitationRecords(searchResults, fetchedPages);
    const trace = buildAnswerTrace(answer, citations);
    return {
        answer,
        groundedBy: fetchedPages.length > 0 ? 'page_excerpt' : 'search_snippet',
        citations,
        answerTrace: trace.paragraphs,
        sourceTrace: trace.sourceTrace,
        traceValidation: trace.validation,
    };
}

function normalizeReportSections(contextSections = []) {
    return contextSections
        .map((section, index) => {
            const title = String(section?.title || `材料 ${index + 1}`).trim();
            const content = String(section?.content || section?.markdown || '').trim();
            if (!content) {
                return '';
            }

            return [
                `### ${title}`,
                content,
            ].join('\n');
        })
        .filter(Boolean);
}

export async function buildStructuredReport({
    question = '',
    instructions = '',
    contextSections = [],
}) {
    if (!DASHSCOPE_API_KEY) {
        throw new Error('API key not configured');
    }

    const sections = normalizeReportSections(contextSections);
    if (!sections.length) {
        throw new Error('No source material available for report composition');
    }

    const agentConfig = loadAdminAgentRuntimeConfig();
    const modelId = resolveChatModel(agentConfig.models?.primaryModelId).id;
    const today = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
            model: modelId,
            stream: false,
            temperature: 0.15,
            max_tokens: 1200,
            messages: [
                {
                    role: 'system',
                    content: [
                        '你是萤火虫的通用文档整理助手。',
                        '请把上游工具返回的材料整理成一份可以直接发给用户的中文 Markdown 文档。',
                        '要求：',
                        '- 严格基于已提供材料，不要编造事实',
                        '- 如果用户要求了“本周/今天/昨天/最近”等相对时间，请结合材料中的时间戳与当前日期判断；当前日期为 ' + today,
                        '- 优先输出提炼后的结论、分组和行动建议，而不是照抄原始表格',
                        '- 若材料不足以支持某个结论，要明确指出“信息不足”或“未查询成功”',
                        '- 如无特殊要求，默认包含：## 摘要、## 关键事项、## 建议动作',
                        '- 若用户明确要求简报/汇报/文档，输出应适合直接转发',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: [
                        `用户请求：${question}`,
                        instructions ? `补充要求：${instructions}` : '',
                        '',
                        '可用材料：',
                        ...sections,
                    ].filter(Boolean).join('\n'),
                },
            ],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`compose-report ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    return {
        answer: payload?.choices?.[0]?.message?.content?.trim() || '',
    };
}

export async function buildDeepResearchAnswer({
    question = '',
    searchResults = [],
    fetchedPages = [],
    instructions = '',
}) {
    if (!DASHSCOPE_API_KEY) {
        throw new Error('API key not configured');
    }

    const agentConfig = loadAdminAgentRuntimeConfig();
    const modelId = resolveChatModel(agentConfig.models?.primaryModelId).id;
    const sourceLines = searchResults.slice(0, 10).map((item, index) => (
        `[${index + 1}] ${item.title}\nsource_id：${item.sourceId || `research-${index + 1}`}\n链接：${item.url}\n检索意图：${item.researchQuery || '主问题'}\n摘要：${item.snippet || '暂无摘要'}`
    ));
    const pageLines = fetchedPages.slice(0, 6).map((item, index) => (
        `正文摘录 [${index + 1}] ${item.title}\nsource_id：${item.sourceId || `research-${index + 1}`}\n检索意图：${item.researchQuery || '主问题'}\n${item.excerpt || '未能提取正文'}`
    ));

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
            model: modelId,
            stream: false,
            temperature: 0.15,
            max_tokens: 1400,
            messages: [
                {
                    role: 'system',
                    content: [
                        '你是萤火虫的深度研究助手。',
                        '请基于给定搜索结果与正文摘录，输出一份小型研究简报。',
                        '要求：',
                        '- 使用中文 Markdown 输出',
                        '- 必须包含以下章节：## 研究结论、## 已确认信息、## 仍待核实、## 下一步建议',
                        '- 如果材料足够，再补充 ## 时间线 或 ## 关键争议',
                        '- 已确认信息尽量标注来源编号 [1] [2]',
                        '- 仍待核实部分必须明确说为什么不能下结论',
                        '- 不要假装看过未提供的正文',
                        '- 不要在末尾重复完整来源清单，来源清单由系统拼接',
                        instructions ? `- 额外执行要求：${instructions}` : '',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: [
                        `研究问题：${question}`,
                        instructions ? `前台接管说明：${instructions}` : '',
                        '',
                        '搜索结果：',
                        ...sourceLines,
                        '',
                        '正文摘录：',
                        ...pageLines,
                    ].join('\n'),
                },
            ],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`deep-research ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim() || '';
    const citations = buildCitationRecords(searchResults, fetchedPages);
    const trace = buildAnswerTrace(answer, citations);
    return {
        answer,
        groundedBy: fetchedPages.length > 0 ? 'page_excerpt' : 'search_snippet',
        citations,
        answerTrace: trace.paragraphs,
        sourceTrace: trace.sourceTrace,
        traceValidation: trace.validation,
    };
}
