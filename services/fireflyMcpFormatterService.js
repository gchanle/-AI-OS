const DEFAULT_EMPTY_TEXT = '暂无相关信息';

function normalizeText(value = '') {
    return String(value || '')
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function sanitizeMarkdownText(value = '') {
    return normalizeText(value)
        .replace(/"/g, '“')
        .replace(/\[/g, '【')
        .replace(/\]/g, '】')
        .replace(/\|/g, '｜');
}

function normalizeHref(value = '') {
    const href = String(value || '').trim();
    if (!href) {
        return '';
    }

    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) {
        return href;
    }

    return `https://${href}`;
}

function formatDateTime(value = '') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return sanitizeMarkdownText(value || '');
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function buildMarkdownLink(label = '', href = '') {
    const safeLabel = sanitizeMarkdownText(label || '查看详情');
    const safeHref = normalizeHref(href);
    return safeHref ? `[${safeLabel}](${safeHref})` : safeLabel;
}

function buildMarkdownTable(headers = [], rows = []) {
    return [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');
}

export function buildMcpNoticeTableMarkdown(items = [], options = {}) {
    const title = options.title || '消息通知';
    const emptyText = options.emptyText || DEFAULT_EMPTY_TEXT;
    const moreLink = options.moreLink || '';

    if (!Array.isArray(items) || items.length === 0) {
        return [
            `### ${sanitizeMarkdownText(title)}`,
            emptyText,
        ].join('\n');
    }

    const rows = items.map((item) => {
        const sender = item.sender || item.creatorName || item.meta?.creatorName || item.sourceLabel || item.source || '未知发件人';
        const href = item.url || item.href || item.sourceUrl || '';

        return [
            buildMarkdownLink(item.title || '未命名消息', href),
            sanitizeMarkdownText(sender),
            formatDateTime(item.createdAt || item.updatedAt || item.sendTime || ''),
        ];
    });

    const lines = [
        `### ${sanitizeMarkdownText(title)}`,
        buildMarkdownTable(['标题', '发件人', '发件时间'], rows),
    ];

    if (moreLink) {
        lines.push('', buildMarkdownLink('查看更多', moreLink));
    }
    lines.push('', `共找到 ${rows.length} 条记录。`);

    return lines.join('\n');
}

export function buildMcpApprovalTableMarkdown(items = [], options = {}) {
    const title = options.title || '审批事项';
    const emptyText = options.emptyText || DEFAULT_EMPTY_TEXT;
    const moreLink = options.moreLink || '';

    if (!Array.isArray(items) || items.length === 0) {
        return [
            `### ${sanitizeMarkdownText(title)}`,
            emptyText,
        ].join('\n');
    }

    const rows = items.map((item) => {
        const processor = item.processor || item.approverLabel || item.sponsor || item.applicantName || item.source || '待确认';
        const href = item.url || item.href || item.pageLinkUrl || item.linkUrl || '';

        return [
            buildMarkdownLink(item.title || item.formName || '审批事项', href),
            sanitizeMarkdownText(processor),
            formatDateTime(item.createdAt || item.updatedAt || item.insertTime || ''),
        ];
    });

    const lines = [
        `### ${sanitizeMarkdownText(title)}`,
        buildMarkdownTable(['标题', '处理人', '发起时间'], rows),
    ];

    if (moreLink) {
        lines.push('', buildMarkdownLink('查看更多', moreLink));
    }
    lines.push('', `共找到 ${rows.length} 条记录。`);

    return lines.join('\n');
}

export function buildMcpAppListMarkdown(items = [], options = {}) {
    const title = options.title || '应用门户';
    const emptyText = options.emptyText || DEFAULT_EMPTY_TEXT;

    if (!Array.isArray(items) || items.length === 0) {
        return [
            `### ${sanitizeMarkdownText(title)}`,
            emptyText,
        ].join('\n');
    }

    const lines = [
        `### ${sanitizeMarkdownText(title)}`,
        ...items.map((item) => `- ${buildMarkdownLink(item.name || item.title || '未命名应用', item.pcUrl || item.href || item.url || '')}`),
        '',
        `共找到 ${items.length} 条记录。`,
    ];

    return lines.join('\n');
}
