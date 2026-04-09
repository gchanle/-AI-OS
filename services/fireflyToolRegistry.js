import { buildCampusMorningDigest } from '@/services/digestService';
import { getApprovalSummary, APPROVAL_CENTER_LINK } from '@/services/approvalService';
import { getUnreadMessageSummary } from '@/services/messageService';
import {
    buildDeepResearchAnswer,
    buildStructuredReport,
    buildWebAnswer,
    fetchPageExcerpt,
    readWebResults,
    searchWeb,
    searchWebDeep,
} from '@/services/fireflyWebSearchService';
import {
    buildUrlInspectionMarkdown,
    buildUrlReadMarkdown,
    extractDirectUrls,
    inspectDirectUrl,
    readDirectUrl,
} from '@/services/fireflyUrlRuntimeService';
import {
    filterEnabledFireflyTools,
    isFireflyToolEnabled,
    loadAdminAgentRuntimeConfig,
} from '@/lib/adminAgentRuntimeStore';

const MESSAGE_LIMIT = 10;
const APPROVAL_LIMIT = 10;
const LIBRARY_LINK = '/library';
const MORNING_DIGEST_LINK = '/messages';

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value || '');
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function truncate(text = '', limit = 180) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) {
        return clean;
    }

    return `${clean.slice(0, limit)}...`;
}

function truncateBlock(text = '', limit = 4000) {
    const clean = String(text || '').trim();
    if (clean.length <= limit) {
        return clean;
    }

    return `${clean.slice(0, limit)}\n...（以下内容已截断）`;
}

function safeStringify(value, limit = 3200) {
    if (value == null) {
        return '';
    }

    try {
        return truncateBlock(JSON.stringify(value, null, 2), limit);
    } catch {
        return '';
    }
}

function hasLibraryContext(snapshot = {}) {
    return Boolean(snapshot.bookId || snapshot.pageBody || snapshot.noteContent || snapshot.bookTitle);
}

function matchMessageTool(question = '') {
    return /未读消息|学习通|校园通知|站内信|消息中心|通知中心|未读通知|校园提醒/.test(question);
}

function matchApprovalTool(question = '') {
    return /审批|待办|流程|我发起|待我审批|抄送我|已审批/.test(question);
}

function matchLibraryTool(question = '', snapshot = {}, capabilityIds = []) {
    const inLibrary = capabilityIds.includes('library') || hasLibraryContext(snapshot);
    return inLibrary && /书|阅读|页|这一页|这段|章节|笔记|摘录|总结|摘要|内容|继续读|继续看|伴读/.test(question);
}

function matchDigestTool(question = '') {
    return /晨报|晨间|日报|早报|校园总览|今日总览|待办总览|消息和审批|审批和消息/.test(question);
}

function buildComposeSourceSection(stepKey = '', result = {}) {
    const title = result?.label || result?.title || stepKey || '上游结果';
    const summary = String(result?.summary || '').trim();
    const markdown = truncateBlock(result?.markdown || '', 4200);
    const data = safeStringify(result?.data, 3200);
    const parts = [
        summary ? `结果摘要：${summary}` : '',
        markdown ? `结果正文：\n${markdown}` : '',
        data ? `结构化数据：\n${data}` : '',
    ].filter(Boolean);

    if (!parts.length) {
        return null;
    }

    return {
        title: `${title}（${stepKey}）`,
        content: parts.join('\n\n'),
    };
}

function buildComposeLinks(sourceResults = []) {
    const deduped = [];
    const seen = new Set();

    sourceResults.forEach((result) => {
        (result?.links || []).forEach((link) => {
            const href = String(link?.href || '').trim();
            if (!href || seen.has(href)) {
                return;
            }
            seen.add(href);
            deduped.push({
                label: link.label || href,
                href,
            });
        });
    });

    return deduped.slice(0, 6);
}

function isCampusQuestion(question = '') {
    return /未读|消息|通知|提醒|审批|待办|流程|我发起|待我审批|抄送我|已审批|晨报|晨间|日报|早报|图书馆|阅读|笔记|章节|课程|教务|校园/.test(question);
}

function matchDirectUrlTool(question = '', contextSnapshot = {}) {
    if (isCampusQuestion(question)) {
        return false;
    }

    if (contextSnapshot?.resumeMode) {
        return false;
    }

    return extractDirectUrls(question).length > 0;
}

function matchDeepResearchTool(question = '', contextSnapshot = {}) {
    if (isCampusQuestion(question)) {
        return false;
    }

    if (contextSnapshot?.resumeMode) {
        return false;
    }

    if (extractDirectUrls(question).length > 0) {
        return false;
    }

    return Boolean(contextSnapshot?.deepResearchEnabled);
}

function matchWebSearchTool(question = '', contextSnapshot = {}) {
    if (isCampusQuestion(question)) {
        return false;
    }

    if (contextSnapshot?.resumeMode) {
        return false;
    }

    if (extractDirectUrls(question).length > 0) {
        return false;
    }

    if (contextSnapshot?.deepResearchEnabled) {
        return false;
    }

    if (contextSnapshot?.webSearchEnabled || contextSnapshot?.deepResearchEnabled) {
        return true;
    }

    return /什么时候|何时|哪一年|哪天|是谁|是谁写的|是什么|什么意思|为什么|原因|多少|几个|多大|完结|完结于|播出|首播|最后一集|结局|上映|发行|成立|出生|去世|主演|集数|季数|票房|排名|where|when|what|who|latest/i.test(question);
}

function buildUnreadMarkdown(result) {
    if (!result.items.length) {
        return [
            '### 学习通通知',
            '当前没有未读消息。',
            '',
            '[打开消息中心](/messages)',
        ].join('\n');
    }

    const lines = [
        '### 学习通通知',
        `当前共有 ${result.unreadCount} 条未读消息，以下展示最近 ${result.items.length} 条。`,
        '',
        '| 标题 | 时间 | 动作 |',
        '| --- | --- | --- |',
        ...result.items.map((item) => (
            `| ${item.title} | ${formatDateTime(item.createdAt)} | [查看详情](/messages/${encodeURIComponent(item.id)}) |`
        )),
        '',
        '[查看更多](/messages)',
    ];

    return lines.join('\n');
}

function buildApprovalMarkdown(result) {
    const sections = [];

    const buildSection = (label, items, total, emptyText, link = APPROVAL_CENTER_LINK) => {
        if (!items.length) {
            return [
                `### ${label}`,
                emptyText,
            ].join('\n');
        }

        return [
            `### ${label}`,
            `共 ${total} 条，以下展示最近 ${items.length} 条。`,
            '',
            '| 标题 | 状态 | 时间 | 动作 |',
            '| --- | --- | --- | --- |',
            ...items.map((item) => (
                `| ${item.title} | ${item.statusLabel} | ${formatDateTime(item.updatedAt)} | ${item.href ? `[打开审批](${item.href})` : '-'} |`
            )),
            '',
            `[查看更多](${link})`,
        ].join('\n');
    };

    sections.push(buildSection(
        '待我审批',
        result.pending,
        result.pendingCount,
        '当前没有待我审批事项。'
    ));

    sections.push(buildSection(
        '我发起的',
        result.initiated,
        result.initiatedCount,
        '当前没有我发起的事项。'
    ));

    sections.push(buildSection(
        '已审批',
        result.recordsByStatus.approved,
        result.recordCountsByStatus.approved,
        '当前没有已审批记录。'
    ));

    sections.push(buildSection(
        '抄送我',
        result.recordsByStatus.copied,
        result.recordCountsByStatus.copied,
        '当前没有抄送我的记录。'
    ));

    sections.push(buildSection(
        '他人已处理',
        result.recordsByStatus.othersProcessed,
        result.recordCountsByStatus.othersProcessed,
        '当前没有他人已处理记录。'
    ));

    return sections.join('\n\n');
}

function buildLibraryMarkdown(question, snapshot = {}) {
    const pageBody = truncate(snapshot.pageBody || snapshot.bookSummary || '');
    const noteContent = truncate(snapshot.noteContent || '');
    const lines = [
        '### 当前阅读上下文',
        `- 当前视图：${snapshot.viewLabel || 'AI 图书馆'}`,
        `- 当前图书：${snapshot.bookTitle || '未定位到图书'}`,
        `- 作者：${snapshot.bookAuthor || '未知作者'}`,
        `- 当前页：${snapshot.pageTitle || '未定位到具体页面'}`,
        `- 阅读进度：${snapshot.readingProgress || '暂无进度信息'}`,
    ];

    if (snapshot.pageQuote) {
        lines.push(`- 当前引文：${snapshot.pageQuote}`);
    }

    if (pageBody) {
        lines.push('', '### 页面摘要', pageBody);
    }

    if (noteContent) {
        lines.push('', '### 当前笔记', noteContent);
    }

    if (/总结|摘要|概括/.test(question)) {
        lines.push(
            '',
            '### 一句话总结',
            `这部分内容主要围绕“${snapshot.pageTitle || snapshot.bookTitle || '当前主题'}”展开，核心线索是：${truncate(snapshot.pageQuote || snapshot.bookSummary || snapshot.pageBody || '', 120)}`
        );
    }

    if (/笔记|摘录|记录/.test(question)) {
        lines.push(
            '',
            '### 笔记建议',
            `- 先用一句话概括“${snapshot.pageTitle || snapshot.bookTitle || '当前内容'}”在回答什么问题`,
            `- 再记录最值得保留的线索：${truncate(snapshot.pageQuote || snapshot.bookSummary || '', 80)}`,
            '- 最后补一条“这段内容能怎么继续读”的个人判断'
        );
    } else {
        lines.push(
            '',
            '### 建议下一步',
            '- 如果你还在理解内容，可以继续追问“这段话真正想说明什么”',
            '- 如果你准备推进阅读，可以让我直接把这一页整理成阅读笔记',
            '- 如果你想继续阅读规划，可以让我给出接下来 3 个最值得追的点'
        );
    }

    lines.push('', `[继续在 AI 图书馆 工作面处理](${LIBRARY_LINK})`);

    return lines.join('\n');
}

function buildMorningDigestMarkdown(digest) {
    const lines = [
        '### 校园晨间摘要',
        `- 未读消息：${digest.counts.unreadMessages} 条`,
        `- 待我审批：${digest.counts.pendingApprovals} 条`,
        `- 我发起的：${digest.counts.initiatedApprovals} 条`,
        `- 已审批：${digest.counts.approvedRecords} 条`,
        `- 抄送我：${digest.counts.copiedRecords} 条`,
        `- 他人已处理：${digest.counts.othersProcessedRecords} 条`,
    ];

    if (digest.sections.pendingApprovals.length > 0) {
        lines.push('', '### 优先审批');
        digest.sections.pendingApprovals.forEach((item) => {
            lines.push(`- ${item.title}（${item.statusLabel}，${formatDateTime(item.updatedAt)}）`);
        });
    }

    if (digest.sections.unreadMessages.length > 0) {
        lines.push('', '### 最新未读消息');
        digest.sections.unreadMessages.forEach((item) => {
            lines.push(`- ${item.title}（${formatDateTime(item.createdAt)}）`);
        });
    }

    if (digest.suggestions.length > 0) {
        lines.push('', '### 建议动作');
        digest.suggestions.forEach((item, index) => {
            lines.push(`${index + 1}. ${item}`);
        });
    }

    lines.push('', `[查看消息中心](${digest.links.messages || MORNING_DIGEST_LINK})`);
    lines.push(`[查看审批中心](${digest.links.approvals || APPROVAL_CENTER_LINK})`);

    return lines.join('\n');
}

function buildWebSearchMarkdown(question, results = []) {
    if (!results.length) {
        return [
            '### 联网搜索',
            `暂时没有为“${question}”找到可用搜索结果。`,
        ].join('\n');
    }

    const lines = [
        '### 联网搜索结果',
        `已为“${question}”找到 ${results.length} 条候选来源。`,
        '',
        '| 来源 | 摘要 | 动作 |',
        '| --- | --- | --- |',
        ...results.map((item) => (
            `| ${item.title} | ${truncate(item.snippet || '暂无摘要', 80)} | [打开来源](${item.url}) |`
        )),
    ];

    return lines.join('\n');
}

function buildWebFetchMarkdown(pages = []) {
    if (!pages.length) {
        return [
            '### 网页摘录',
            '已完成来源访问，但暂时没有提取到可用正文。',
        ].join('\n');
    }

    const lines = ['### 网页摘录'];
    pages.forEach((item, index) => {
        lines.push(
            '',
            `#### 来源 ${index + 1}：${item.title}`,
            truncate(item.excerpt || '未能提取正文。', 240)
        );
    });

    return lines.join('\n');
}

function buildWebSourceMarkdown(searchResults = [], fetchedPages = []) {
    if (!searchResults.length) {
        return '';
    }

    const fetchedUrlSet = new Set(
        fetchedPages
            .map((item) => String(item.url || '').trim())
            .filter(Boolean)
    );

    const lines = [
        '## 来源',
        ...searchResults.slice(0, 4).map((item, index) => {
            let hostLabel = '';

            try {
                hostLabel = new URL(item.url).hostname.replace(/^www\./, '');
            } catch {
                hostLabel = '网页';
            }

            const qualityLabel = fetchedUrlSet.has(item.url) ? '已抓取正文' : '仅搜索摘要';

            return `- [${index + 1}] [${hostLabel}] ${item.title}（${qualityLabel}，${truncate(item.snippet || '已命中联网来源', 42)}） [打开来源](${item.url})`;
        }),
    ];

    return lines.join('\n');
}

function buildDeepResearchSearchMarkdown(question, queries = [], results = []) {
    const lines = [
        '### 深度研究检索',
        `已围绕“${question}”扩展 ${queries.length} 个研究子查询，汇总 ${results.length} 条候选来源。`,
    ];

    if (queries.length) {
        lines.push('', `研究查询：${queries.join(' / ')}`);
    }

    if (results.length) {
        lines.push('', '| 来源 | 检索意图 | 摘要 | 动作 |', '| --- | --- | --- | --- |');
        results.slice(0, 8).forEach((item) => {
            lines.push(`| ${item.title} | ${item.researchQuery || '主问题'} | ${truncate(item.snippet || '暂无摘要', 70)} | [打开来源](${item.url}) |`);
        });
    }

    return lines.join('\n');
}

function buildDeepResearchReadMarkdown(pages = [], failedPages = []) {
    const lines = [
        '### 深度研究阅读',
        pages.length
            ? `已抓取 ${pages.length} 个来源正文，以下展示关键摘录。`
            : '已尝试抓取研究来源，但暂时没有提取到足够正文。',
    ];

    pages.forEach((item, index) => {
        lines.push(
            '',
            `#### 正文 ${index + 1}：${item.title}`,
            `检索意图：${item.researchQuery || '主问题'}`,
            truncate(item.excerpt || '未能提取正文。', 260)
        );
    });

    if (failedPages.length) {
        lines.push('', '### 暂未抓取成功');
        failedPages.forEach((item) => {
            lines.push(`- ${item.title}（${item.researchQuery || '主问题'}）`);
        });
    }

    return lines.join('\n');
}

function buildDeepResearchSourceMarkdown(searchResults = [], fetchedPages = []) {
    const fetchedUrlSet = new Set(
        fetchedPages
            .map((item) => String(item.url || '').trim())
            .filter(Boolean)
    );

    const lines = [
        '## 研究来源',
        ...searchResults.slice(0, 8).map((item, index) => (
            `- [${index + 1}] ${item.title}（${item.researchQuery || '主问题'} / ${fetchedUrlSet.has(item.url) ? '已读正文' : '仅搜索摘要'}） [打开来源](${item.url})`
        )),
    ];

    return lines.join('\n');
}

const fireflyToolRegistry = [
    {
        id: 'messages.unread_summary',
        name: '未读消息工具',
        capabilityId: 'messages',
        description: '读取学习通通知并整理未读消息摘要。',
        sourceKind: 'skill_adapter',
        sourceRefs: {
            connectors: ['notice-center'],
            skills: ['service-notice-digest'],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer', 'message_center'],
        matcher: ({ question }) => matchMessageTool(question),
        execute: async ({ uid, fid, contextSnapshot, runtimeInput }) => {
            let result = null;
            const limit = Math.max(1, Number(runtimeInput?.limit || MESSAGE_LIMIT));

            try {
                result = await getUnreadMessageSummary({
                    uid,
                    fid,
                    limit,
                });
            } catch (error) {
                if (contextSnapshot?.unreadSummary) {
                    return {
                        summary: '已使用当前会话中的未读消息摘要',
                        markdown: `### 学习通通知\n${contextSnapshot.unreadSummary}`,
                        links: [{ label: '消息中心', href: '/messages' }],
                        data: {
                            source: 'context_snapshot',
                        },
                    };
                }

                throw error;
            }

            return {
                summary: result.items.length > 0
                    ? `已整理 ${result.items.length} 条最近未读消息`
                    : '当前没有未读消息',
                markdown: buildUnreadMarkdown(result),
                links: [{ label: '消息中心', href: '/messages' }],
                data: result,
            };
        },
    },
    {
        id: 'approvals.center_overview',
        name: '审批待办工具',
        capabilityId: 'services',
        description: '读取审批待办、我发起的和审批记录，并返回结构化总览。',
        sourceKind: 'connector_backed',
        sourceRefs: {
            connectors: ['service-hall'],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer', 'service_center'],
        matcher: ({ question }) => matchApprovalTool(question),
        execute: async ({ uid, fid, contextSnapshot, runtimeInput }) => {
            let result = null;
            const limit = Math.max(1, Number(runtimeInput?.limit || APPROVAL_LIMIT));

            try {
                result = await getApprovalSummary({
                    uid,
                    fid,
                    limit,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : '未知错误';
                if (contextSnapshot?.approvalSummary) {
                    throw new Error(`审批实时查询失败：${message}。已阻止回退到旧审批摘要，请稍后重试。`);
                }

                throw new Error(`审批实时查询失败：${message}`);
            }

            return {
                summary: `待我审批 ${result.pendingCount} 条，我发起的 ${result.initiatedCount} 条`,
                markdown: buildApprovalMarkdown(result),
                links: [{ label: '审批中心', href: APPROVAL_CENTER_LINK }],
                data: result,
            };
        },
    },
    {
        id: 'compose.report',
        name: '通用成文工具',
        capabilityId: 'services',
        description: '基于前置工具结果生成结构化简报、汇总或文档。',
        sourceKind: 'composed_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer', 'service_center'],
        matcher: () => false,
        execute: async ({ question, runtimeState, runtimeInput }) => {
            const stepResults = runtimeState?.stepResults && typeof runtimeState.stepResults === 'object'
                ? runtimeState.stepResults
                : {};
            const requestedKeys = Array.isArray(runtimeInput?.sourceStepKeys)
                ? runtimeInput.sourceStepKeys.filter(Boolean)
                : [];
            const sourceKeys = (requestedKeys.length ? requestedKeys : Object.keys(stepResults))
                .filter((key) => key !== 'compose.report');
            const sourceResults = sourceKeys
                .map((key) => ({
                    key,
                    result: stepResults[key],
                }))
                .filter(({ result }) => result && !result.warning);
            const contextSections = sourceResults
                .map(({ key, result }) => buildComposeSourceSection(key, result))
                .filter(Boolean);

            if (!contextSections.length) {
                throw new Error('当前没有可整理的上游结果。');
            }

            const report = await buildStructuredReport({
                question,
                instructions: String(runtimeInput?.reportInstructions || '').trim(),
                contextSections,
            });
            const answer = String(report?.answer || '').trim();

            return {
                summary: answer
                    ? `已基于 ${contextSections.length} 份材料整理结构化文档`
                    : '已完成材料整理，但暂时没有生成可用文档',
                markdown: answer || '已完成材料整理，但暂时没有生成可用文档。',
                links: buildComposeLinks(sourceResults.map((item) => item.result)),
                preferAsReply: true,
                data: {
                    answer,
                    sourceStepKeys: sourceResults.map((item) => item.key),
                    sourceCount: contextSections.length,
                },
            };
        },
    },
    {
        id: 'library.reading_context',
        name: '阅读上下文工具',
        capabilityId: 'library',
        description: '结合当前图书、页面和笔记上下文，生成阅读协同建议。',
        sourceKind: 'native_context',
        sourceRefs: {
            connectors: ['library-opac'],
            skills: ['library-reading-companion'],
            mcp: [],
            cli: [],
        },
        surfaces: ['library_workspace', 'side_drawer', 'main_chat'],
        matcher: ({ question, contextSnapshot, capabilityIds }) => matchLibraryTool(question, contextSnapshot, capabilityIds),
        execute: async ({ question, contextSnapshot }) => ({
            summary: `已基于《${contextSnapshot.bookTitle || '当前图书'}》整理阅读上下文`,
            markdown: buildLibraryMarkdown(question, contextSnapshot),
            links: [{ label: 'AI 图书馆', href: LIBRARY_LINK }],
            data: contextSnapshot,
        }),
    },
    {
        id: 'digest.morning_briefing',
        name: '校园晨间摘要工具',
        capabilityId: 'services',
        description: '聚合未读消息与审批信息，生成一条晨间摘要，可用于会话或后台任务。',
        sourceKind: 'composed_runtime',
        sourceRefs: {
            connectors: ['notice-center', 'service-hall'],
            skills: ['service-notice-digest'],
            mcp: [],
            cli: [],
        },
        surfaces: ['scheduled_task', 'main_chat', 'notification_center'],
        matcher: ({ question }) => matchDigestTool(question),
        execute: async ({ uid, fid, runtimeInput }) => {
            const digest = await buildCampusMorningDigest({
                uid,
                fid,
                ...runtimeInput,
                includeUnreadMessages: runtimeInput?.preferences?.includeUnreadMessages,
                includeApprovalTodos: runtimeInput?.preferences?.includeApprovalTodos,
                includeApprovalRecords: runtimeInput?.preferences?.includeApprovalRecords,
            });

            return {
                summary: `已生成校园晨间摘要，待我审批 ${digest.counts.pendingApprovals} 条，未读消息 ${digest.counts.unreadMessages} 条`,
                markdown: buildMorningDigestMarkdown(digest),
                links: [
                    { label: '消息中心', href: digest.links.messages || MORNING_DIGEST_LINK },
                    { label: '审批中心', href: digest.links.approvals || APPROVAL_CENTER_LINK },
                ],
                data: digest,
            };
        },
    },
    {
        id: 'research.search',
        name: '深度研究检索工具',
        capabilityId: 'research',
        description: '围绕研究问题扩展多个子查询并汇总候选来源。',
        sourceKind: 'research_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: ({ question, contextSnapshot }) => matchDeepResearchTool(question, contextSnapshot),
        execute: async ({ question, runtimeState }) => {
            const research = await searchWebDeep(question, {
                perQueryLimit: 4,
                maxResults: 12,
            });
            runtimeState.researchSearch = {
                question,
                queries: research.queries,
                results: research.results,
            };

            return {
                summary: `已扩展 ${research.queries.length} 个研究查询，汇总 ${research.results.length} 条来源`,
                markdown: buildDeepResearchSearchMarkdown(question, research.queries, research.results),
                links: research.results.slice(0, 4).map((item) => ({ label: item.title, href: item.url })),
                data: {
                    question,
                    queries: research.queries,
                    results: research.results,
                },
            };
        },
    },
    {
        id: 'research.read',
        name: '深度研究阅读工具',
        capabilityId: 'research',
        description: '抓取研究来源正文，提炼可用于比对的内容摘录。',
        sourceKind: 'research_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: () => false,
        execute: async ({ runtimeState }) => {
            const searchState = runtimeState.researchSearch || {};
            const results = Array.isArray(searchState.results) ? searchState.results : [];
            const reading = await readWebResults(results, {
                maxPages: 6,
                excerptLimit: 1800,
            });
            runtimeState.researchRead = reading;

            return {
                summary: reading.pages.length > 0
                    ? `已抓取 ${reading.pages.length} 个研究正文${reading.failedPages.length ? `，${reading.failedPages.length} 个来源仍受限` : ''}`
                    : '已尝试抓取研究正文，但可用内容仍较少',
                markdown: buildDeepResearchReadMarkdown(reading.pages, reading.failedPages),
                links: reading.pages.slice(0, 4).map((item) => ({ label: item.title, href: item.url })),
                data: reading,
            };
        },
    },
    {
        id: 'research.report',
        name: '深度研究报告工具',
        capabilityId: 'research',
        description: '基于搜索与正文摘录生成一份结构化研究简报。',
        sourceKind: 'research_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: () => false,
        execute: async ({ question, runtimeState }) => {
            const searchResults = runtimeState.researchSearch?.results || [];
            const fetchedPages = runtimeState.researchRead?.pages || [];
            const failedPages = runtimeState.researchRead?.failedPages || [];
            let answerPayload = null;

            try {
                answerPayload = await buildDeepResearchAnswer({
                    question,
                    searchResults,
                    fetchedPages,
                });
            } catch {
                answerPayload = await buildWebAnswer({
                    question: `${question}\n请以研究简报的方式输出，至少包含结论、已确认信息、仍待核实、下一步建议。`,
                    searchResults,
                    fetchedPages,
                });
            }

            const { answer, groundedBy } = answerPayload;

            return {
                summary: answer
                    ? `已生成深度研究简报（来源 ${searchResults.length} 条，正文 ${fetchedPages.length} 条${failedPages.length ? `，受限 ${failedPages.length} 条` : ''}）`
                    : '深度研究报告已生成',
                markdown: [
                    answer || '已完成深度研究，但暂时没有生成可用报告。',
                    buildDeepResearchSourceMarkdown(searchResults, fetchedPages),
                ].filter(Boolean).join('\n\n'),
                links: searchResults.slice(0, 4).map((item) => ({ label: item.title, href: item.url })),
                data: {
                    answer,
                    groundedBy,
                    queries: runtimeState.researchSearch?.queries || [],
                    searchResults,
                    fetchedPages,
                    failedPages,
                },
            };
        },
    },
    {
        id: 'url.inspect',
        name: 'URL 识别工具',
        capabilityId: 'research',
        description: '识别用户提供的 URL，并判断更适合阅读还是交互执行。',
        sourceKind: 'url_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: ({ question, contextSnapshot }) => matchDirectUrlTool(question, contextSnapshot),
        execute: async ({ question, runtimeState }) => {
            const inspection = inspectDirectUrl(question);
            runtimeState.urlInspect = inspection;

            return {
                summary: inspection?.summary || '当前没有识别到可处理的链接',
                markdown: buildUrlInspectionMarkdown(inspection),
                links: inspection?.urls?.slice(0, 1).map((item) => ({ label: '打开链接', href: item })) || [],
                data: inspection || {
                    target: null,
                    urls: [],
                },
            };
        },
    },
    {
        id: 'page.read',
        name: '页面读取工具',
        capabilityId: 'research',
        description: '按 URL 类型分层读取页面内容，并返回正文质量与推荐通道。',
        sourceKind: 'url_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: () => false,
        execute: async ({ runtimeState }) => {
            const inspectState = runtimeState.urlInspect || {};
            const targetUrl = String(inspectState?.target?.url || inspectState?.urls?.[0] || '').trim();

            if (!targetUrl) {
                return {
                    summary: '当前没有可读取的链接',
                    markdown: '### 页面读取\n当前没有识别到可读取的 URL。',
                    links: [],
                    data: {
                        target: null,
                        page: null,
                    },
                };
            }

            const readResult = await readDirectUrl(targetUrl);
            runtimeState.pageRead = readResult;

            return {
                summary: readResult.page?.excerpt
                    ? `已读取页面内容：${readResult.page.title || readResult.target.hostname}`
                    : `页面已访问，但正文读取受限：${readResult.target.hostname}`,
                markdown: buildUrlReadMarkdown(readResult),
                links: [{ label: '打开原链接', href: readResult.fetch?.finalUrl || targetUrl }],
                data: readResult,
            };
        },
    },
    {
        id: 'page.answer',
        name: '页面理解工具',
        capabilityId: 'research',
        description: '基于页面读取结果生成结构化回答，若正文不足会明确提示限制。',
        sourceKind: 'url_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: () => false,
        execute: async ({ question, runtimeState }) => {
            const readResult = runtimeState.pageRead || null;
            const targetUrl = String(readResult?.fetch?.finalUrl || readResult?.target?.url || '').trim();
            const excerpt = String(readResult?.page?.excerpt || '').trim();
            const title = String(readResult?.page?.title || readResult?.target?.hostname || '当前页面').trim();
            const limitations = Array.isArray(readResult?.decision?.limitations) ? readResult.decision.limitations : [];

            if (!targetUrl) {
                return {
                    summary: '当前没有可回答的页面上下文',
                    markdown: '### 页面理解\n当前没有可用于回答的页面读取结果。',
                    links: [],
                    data: {
                        answer: '',
                    },
                };
            }

            if (!excerpt) {
                return {
                    summary: '当前无法可靠总结该链接，因为没有拿到稳定正文',
                    markdown: [
                        '## 页面理解受限',
                        '当前没有提取到足够稳定的正文，因此不适合直接给出像“已完整阅读文章后”的总结。',
                        '',
                        '### 建议下一步',
                        ...limitations.map((item) => `- ${item}`),
                        `- 可先打开原链接人工确认，后续接入浏览器读取后再由萤火虫总结。`,
                        '',
                        `[打开原链接](${targetUrl})`,
                    ].join('\n'),
                    links: [{ label: '打开原链接', href: targetUrl }],
                    data: {
                        answer: '',
                        groundedBy: 'unavailable',
                        limitations,
                        page: readResult?.page || null,
                    },
                };
            }

            const searchResults = [
                {
                    title,
                    url: targetUrl,
                    snippet: readResult?.page?.description || '',
                },
            ];
            const fetchedPages = [
                {
                    title,
                    url: targetUrl,
                    excerpt,
                },
            ];
            const { answer, groundedBy } = await buildWebAnswer({
                question,
                searchResults,
                fetchedPages,
            });

            return {
                summary: answer
                    ? `已基于页面正文生成回答：${title}`
                    : '已读取页面，但暂时没有生成可用回答',
                markdown: [
                    '## 页面理解',
                    answer || '已完成页面读取，但暂时没有生成可用回答。',
                    '',
                    '## 来源',
                    `- [${title}](${targetUrl})`,
                ].join('\n\n'),
                links: [{ label: '打开原链接', href: targetUrl }],
                data: {
                    answer,
                    groundedBy,
                    targetUrl,
                    page: readResult?.page || null,
                    limitations,
                },
            };
        },
    },
    {
        id: 'web.search',
        name: '联网搜索工具',
        capabilityId: 'research',
        description: '针对通用事实问题执行联网搜索，返回候选来源。',
        sourceKind: 'web_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: ({ question, contextSnapshot }) => matchWebSearchTool(question, contextSnapshot),
        execute: async ({ question, runtimeState }) => {
            const results = await searchWeb(question);
            runtimeState.webSearch = {
                question,
                results,
            };

            return {
                summary: results.length > 0
                    ? `已找到 ${results.length} 条联网来源`
                    : '暂未找到可用联网来源',
                markdown: buildWebSearchMarkdown(question, results),
                links: results.slice(0, 3).map((item) => ({ label: item.title, href: item.url })),
                data: {
                    question,
                    results,
                },
            };
        },
    },
    {
        id: 'web.fetch',
        name: '网页读取工具',
        capabilityId: 'research',
        description: '读取搜索结果对应网页正文，提取可供回答的问题上下文。',
        sourceKind: 'web_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: () => false,
        execute: async ({ runtimeState }) => {
            const searchState = runtimeState.webSearch || {};
            const results = Array.isArray(searchState.results) ? searchState.results : [];
            const attempts = await Promise.all(
                results.slice(0, 3).map(async (item) => ({
                    title: item.title,
                    url: item.url,
                    excerpt: await fetchPageExcerpt(item.url),
                }))
            );
            const pages = attempts.filter((item) => item.excerpt);
            const failedPages = attempts.filter((item) => !item.excerpt);

            runtimeState.webFetch = {
                pages,
                failedPages,
            };

            return {
                summary: pages.length > 0
                    ? `已读取 ${pages.length} 个来源正文${failedPages.length ? `，${failedPages.length} 个来源未能抓取` : ''}`
                    : '已尝试读取网页正文，但可用内容较少',
                markdown: [
                    buildWebFetchMarkdown(pages),
                    failedPages.length
                        ? `\n### 读取受限来源\n${failedPages.map((item) => `- ${item.title}`).join('\n')}`
                        : '',
                ].filter(Boolean).join('\n'),
                links: pages.map((item) => ({ label: item.title, href: item.url })),
                data: {
                    pages,
                    failedPages,
                },
            };
        },
    },
    {
        id: 'web.answer',
        name: '联网回答工具',
        capabilityId: 'research',
        description: '基于搜索结果与网页摘录生成一条结构化回答。',
        sourceKind: 'web_runtime',
        sourceRefs: {
            connectors: [],
            skills: [],
            mcp: [],
            cli: [],
        },
        surfaces: ['main_chat', 'side_drawer'],
        matcher: () => false,
        execute: async ({ question, runtimeState }) => {
            const searchResults = runtimeState.webSearch?.results || [];
            const fetchedPages = runtimeState.webFetch?.pages || [];
            const failedPages = runtimeState.webFetch?.failedPages || [];
            const { answer, groundedBy } = await buildWebAnswer({
                question,
                searchResults,
                fetchedPages,
            });
            const sourceMarkdown = buildWebSourceMarkdown(searchResults, fetchedPages);
            const groundingNote = groundedBy === 'page_excerpt'
                ? '## 回答依据\n本次回答优先基于网页正文摘录生成。'
                : '## 回答依据\n本次回答主要基于搜索结果摘要生成，正文抓取较少，结论可信度相对更弱。';

            runtimeState.webAnswer = {
                answer,
                groundedBy,
            };

            return {
                summary: answer
                    ? `已生成联网回答（来源 ${searchResults.length} 条，正文 ${fetchedPages.length} 条${failedPages.length ? `，失败 ${failedPages.length} 条` : ''}）`
                    : '联网回答生成完成',
                markdown: [
                    groundingNote,
                    answer || '已完成联网查询，但暂时没有生成可用回答。',
                    sourceMarkdown,
                ].filter(Boolean).join('\n\n'),
                links: searchResults.slice(0, 3).map((item) => ({ label: item.title, href: item.url })),
                data: {
                    answer,
                    groundedBy,
                    searchResults,
                    fetchedPages,
                    failedPages,
                },
            };
        },
    },
];

export function listFireflyTools() {
    const config = loadAdminAgentRuntimeConfig();
    return filterEnabledFireflyTools(
        fireflyToolRegistry.map(({ matcher, execute, ...tool }) => tool),
        config
    );
}

export function resolveFireflyTool(toolId) {
    const config = loadAdminAgentRuntimeConfig();
    const tool = fireflyToolRegistry.find((item) => item.id === toolId) || null;
    if (!tool || !isFireflyToolEnabled(toolId, config)) {
        return null;
    }

    return tool;
}

export function matchFireflyTools({ question, contextSnapshot, capabilityIds = [] }) {
    const config = loadAdminAgentRuntimeConfig();
    return filterEnabledFireflyTools(fireflyToolRegistry, config).filter((tool) => tool.matcher({
        question,
        contextSnapshot,
        capabilityIds,
    }));
}
