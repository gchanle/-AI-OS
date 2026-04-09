'use client';
import React from 'react';

const markdownLinkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const rawLinkPattern = /(https?:\/\/[^\s]+|\/messages\/[^\s]+)/g;
const inlinePattern = /(\[([^\]]+)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(https?:\/\/[^\s]+|\/messages\/[^\s]+)/g;
const MESSAGE_SUMMARY_LIMIT = 10;
const APPROVAL_SUMMARY_LIMIT = 10;
const APPROVAL_CENTER_LINK = 'https://office.chaoxing.com/front/web/approve/apps/index?';
const SUMMARY_HEADER_PATTERN = /^([^：]+)：共\s*(\d+)\s*条，以下展示最近\s*(\d+)\s*条。\[查看更多\]\(([^)]+)\)$/;
const MESSAGE_HEADER_PATTERN = /^当前共有\s*(\d+)\s*条未读消息，以下展示最近\s*(\d+)\s*条。\[查看更多\]\(([^)]+)\)$/;
const APPROVAL_SECTION_LABELS = new Set(['待我审批', '我发起的', '已审批', '抄送我', '他人已处理']);
const TABLE_SEPARATOR_PATTERN = /^\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*)?$/;
const ACTION_LABEL_PATTERN = /^\[([^\]]+)\]$/;
const PAREN_URL_PATTERN = /^\((https?:\/\/[^)]+)\)$/;
const SUBSECTION_PATTERN = /^(.+?)(?:（(\d+)条）)?：$/;

function normalizeHref(href = '') {
    if (!href) {
        return '#';
    }

    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) {
        return href;
    }

    return `https://${href}`;
}

function parseInlineContent(text = '', keyPrefix = 'inline', linkClassName = 'msg-link') {
    const nodes = [];
    let cursor = 0;
    let matchIndex = 0;

    for (const match of text.matchAll(inlinePattern)) {
        if (match.index > cursor) {
            nodes.push(
                <span key={`${keyPrefix}-text-${matchIndex}`}>
                    {text.slice(cursor, match.index)}
                </span>
            );
        }

        if (match[1]) {
            const href = normalizeHref(match[3]);
            nodes.push(
                <a
                    key={`${keyPrefix}-md-link-${matchIndex}`}
                    href={href}
                    className={linkClassName}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                >
                    {match[2]}
                </a>
            );
        } else if (match[4]) {
            nodes.push(
                <code key={`${keyPrefix}-code-${matchIndex}`} className="rich-inline-code">
                    {match[5]}
                </code>
            );
        } else if (match[6]) {
            nodes.push(
                <strong key={`${keyPrefix}-bold-${matchIndex}`} className="rich-strong">
                    {match[7]}
                </strong>
            );
        } else if (match[8]) {
            const href = normalizeHref(match[8]);
            nodes.push(
                <a
                    key={`${keyPrefix}-raw-link-${matchIndex}`}
                    href={href}
                    className={linkClassName}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                >
                    {match[8]}
                </a>
            );
        }

        cursor = match.index + match[0].length;
        matchIndex += 1;
    }

    if (cursor < text.length) {
        nodes.push(
            <span key={`${keyPrefix}-tail-${matchIndex}`}>
                {text.slice(cursor)}
            </span>
        );
    }

    return nodes.length > 0 ? nodes : text;
}

function parseSummaryHeader(line = '') {
    const messageMatch = line.match(MESSAGE_HEADER_PATTERN);
    if (messageMatch) {
        return {
            label: '未读消息',
            total: Number(messageMatch[1]),
            visible: Number(messageMatch[2]),
            href: normalizeHref(messageMatch[3]),
            kind: 'message',
        };
    }

    const summaryMatch = line.match(SUMMARY_HEADER_PATTERN);
    if (!summaryMatch) {
        return null;
    }

    const label = summaryMatch[1].trim();
    return {
        label,
        total: Number(summaryMatch[2]),
        visible: Number(summaryMatch[3]),
        href: normalizeHref(summaryMatch[4]),
        kind: APPROVAL_SECTION_LABELS.has(label) ? 'approval' : 'generic',
    };
}

function parseSummaryItem(line = '') {
    const links = [...line.matchAll(markdownLinkPattern)].map((match) => ({
        label: match[1],
        href: normalizeHref(match[2]),
    }));

    const actionLinks = links.filter((item) => item.label !== '查看更多');
    let content = line.replace(/^- /, '').trim();
    content = content.replace(markdownLinkPattern, '').replace(/\s*·\s*/g, ' ').trim();

    let sourceLabel = '';
    const sourceMatch = content.match(/^\[([^\]]+)\]\s*/);
    if (sourceMatch) {
        sourceLabel = sourceMatch[1];
        content = content.slice(sourceMatch[0].length).trim();
    }

    let title = content;
    let metaPrimary = '';
    let metaSecondary = '';
    const metaMatch = content.match(/^(.*?)(?:（(.+?)）)?$/);
    if (metaMatch) {
        title = metaMatch[1].trim();
        const rawMeta = String(metaMatch[2] || '').trim();
        if (rawMeta.includes('，')) {
            const [first, ...rest] = rawMeta.split('，');
            metaPrimary = first.trim();
            metaSecondary = rest.join('，').trim();
        } else {
            metaSecondary = rawMeta;
        }
    }

    return {
        title,
        sourceLabel,
        metaPrimary,
        metaSecondary,
        actionLinks,
    };
}

function parseTableRow(line = '') {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function parseBlocks(content = '') {
    const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            index += 1;
            continue;
        }

        const actionLabelMatch = trimmed.match(ACTION_LABEL_PATTERN);
        const nextTrimmed = lines[index + 1]?.trim() || '';
        if (actionLabelMatch && PAREN_URL_PATTERN.test(nextTrimmed)) {
            blocks.push({
                type: 'actionLink',
                label: actionLabelMatch[1],
                href: normalizeHref(nextTrimmed.match(PAREN_URL_PATTERN)[1]),
            });
            index += 2;
            continue;
        }

        const summaryHeader = parseSummaryHeader(trimmed);
        if (summaryHeader) {
            const items = [];
            index += 1;

            while (index < lines.length) {
                const nextLine = lines[index].trim();
                if (!nextLine) {
                    index += 1;
                    break;
                }
                if (parseSummaryHeader(nextLine)) {
                    break;
                }
                if (!nextLine.startsWith('- ')) {
                    break;
                }
                items.push(parseSummaryItem(nextLine));
                index += 1;
            }

            blocks.push({
                type: 'summary',
                ...summaryHeader,
                items,
            });
            continue;
        }

        const subsectionMatch = trimmed.match(SUBSECTION_PATTERN);
        if (subsectionMatch && index + 1 < lines.length && /^-\s+/.test(lines[index + 1].trim())) {
            const items = [];
            index += 1;

            while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
                items.push(parseSummaryItem(lines[index].trim()));
                index += 1;
            }

            blocks.push({
                type: 'subsection',
                label: subsectionMatch[1].trim(),
                count: Number(subsectionMatch[2] || items.length || 0),
                items,
            });
            continue;
        }

        if (/^```/.test(trimmed)) {
            const codeLines = [];
            const language = trimmed.replace(/^```/, '').trim();
            index += 1;
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) {
                index += 1;
            }
            blocks.push({
                type: 'code',
                language,
                content: codeLines.join('\n'),
            });
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            blocks.push({
                type: 'heading',
                level: headingMatch[1].length,
                content: headingMatch[2],
            });
            index += 1;
            continue;
        }

        if (/^>\s+/.test(trimmed)) {
            const quoteLines = [];
            while (index < lines.length && /^>\s+/.test(lines[index].trim())) {
                quoteLines.push(lines[index].trim().replace(/^>\s+/, ''));
                index += 1;
            }
            blocks.push({
                type: 'quote',
                content: quoteLines.join('\n'),
            });
            continue;
        }

        if (
            trimmed.includes('|')
            && index + 1 < lines.length
            && TABLE_SEPARATOR_PATTERN.test(lines[index + 1].trim())
        ) {
            const header = parseTableRow(trimmed);
            const rows = [];
            index += 2;

            while (index < lines.length) {
                const current = lines[index].trim();
                if (!current || !current.includes('|')) {
                    break;
                }
                rows.push(parseTableRow(current));
                index += 1;
            }

            blocks.push({
                type: 'table',
                header,
                rows,
            });
            continue;
        }

        if (/^-\s+/.test(trimmed)) {
            const items = [];
            while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^-\s+/, ''));
                index += 1;
            }
            blocks.push({
                type: 'list',
                ordered: false,
                items,
            });
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items = [];
            while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
                index += 1;
            }
            blocks.push({
                type: 'list',
                ordered: true,
                items,
            });
            continue;
        }

        const paragraphLines = [];
        while (index < lines.length) {
            const current = lines[index].trim();
            if (
                !current
                || parseSummaryHeader(current)
                || /^```/.test(current)
                || /^(#{1,3})\s+/.test(current)
                || /^>\s+/.test(current)
                || /^-\s+/.test(current)
                || /^\d+\.\s+/.test(current)
            ) {
                break;
            }
            paragraphLines.push(current);
            index += 1;
        }
        if (paragraphLines.length > 0) {
            blocks.push({
                type: 'paragraph',
                content: paragraphLines.join(' '),
            });
            continue;
        }

        index += 1;
    }

    return blocks;
}

function renderSummaryBlock(block, blockIndex, linkClassName) {
    const isApproval = block.kind === 'approval';
    const columns = isApproval
        ? ['标题', '状态', '时间', '操作']
        : ['来源', '标题', '时间', '操作'];

    return (
        <section
            key={`summary-${blockIndex}`}
            className={`rich-summary-section ${block.kind === 'approval' ? 'approval' : 'generic'}`}
        >
            <div className="rich-summary-head">
                <div className="rich-summary-title-row">
                    <strong className="rich-summary-title">{block.label}</strong>
                </div>
                <span className="rich-summary-count">共 {block.total} 条，展示 {block.visible} 条</span>
                <a
                    href={block.href}
                    className={`rich-summary-link ${linkClassName}`}
                    target={block.href.startsWith('http') ? '_blank' : undefined}
                    rel={block.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                >
                    查看更多
                </a>
            </div>
            {block.items.length > 0 ? (
                <div className="rich-table-wrap">
                    <table className="rich-summary-table">
                        <thead>
                            <tr>
                                {columns.map((column) => (
                                    <th key={`${block.label}-${column}`}>{column}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.items.map((item, itemIndex) => (
                                <tr key={`summary-item-${blockIndex}-${itemIndex}`}>
                                    {isApproval ? (
                                        <>
                                            <td className="title-cell">{item.title}</td>
                                            <td>
                                                {item.metaPrimary ? (
                                                    <span className={`rich-summary-badge ${item.metaPrimary.includes('待') ? 'pending' : ''}`}>
                                                        {item.metaPrimary}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td>{item.metaSecondary || '-'}</td>
                                            <td>
                                                <div className="rich-summary-actions inline">
                                                    {item.actionLinks.map((link, linkIndex) => (
                                                        <a
                                                            key={`summary-link-${blockIndex}-${itemIndex}-${linkIndex}`}
                                                            href={link.href}
                                                            className={`rich-summary-action ${linkClassName}`}
                                                            target={link.href.startsWith('http') ? '_blank' : undefined}
                                                            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                                        >
                                                            {link.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>{item.sourceLabel || '-'}</td>
                                            <td className="title-cell">{item.title}</td>
                                            <td>{item.metaSecondary || '-'}</td>
                                            <td>
                                                <div className="rich-summary-actions inline">
                                                    {item.actionLinks.map((link, linkIndex) => (
                                                        <a
                                                            key={`summary-link-${blockIndex}-${itemIndex}-${linkIndex}`}
                                                            href={link.href}
                                                            className={`rich-summary-action ${linkClassName}`}
                                                            target={link.href.startsWith('http') ? '_blank' : undefined}
                                                            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                                        >
                                                            {link.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="rich-summary-empty">当前没有可展示数据。</div>
            )}
        </section>
    );
}

export function renderRichMessageContent(content = '', linkClassName = 'msg-link') {
    const blocks = parseBlocks(content);

    return (
        <div className="rich-content">
            {blocks.map((block, blockIndex) => {
                if (block.type === 'summary') {
                    return renderSummaryBlock(block, blockIndex, linkClassName);
                }

                if (block.type === 'actionLink') {
                    return (
                        <div key={`action-link-${blockIndex}`} className="rich-action-link-wrap">
                            <a
                                href={block.href}
                                className={`rich-action-link ${linkClassName}`}
                                target={block.href.startsWith('http') ? '_blank' : undefined}
                                rel={block.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                            >
                                {block.label}
                            </a>
                        </div>
                    );
                }

                if (block.type === 'subsection') {
                    return (
                        <section key={`subsection-${blockIndex}`} className="rich-subsection">
                            <div className="rich-subsection-head">
                                <strong className="rich-subsection-title">{block.label}</strong>
                                <span className="rich-subsection-count">{block.count} 条</span>
                            </div>
                            <div className="rich-subsection-list">
                                {block.items.map((item, itemIndex) => (
                                    <div key={`subsection-item-${blockIndex}-${itemIndex}`} className="rich-subsection-item">
                                        <div className="rich-subsection-item-top">
                                            <div className="rich-subsection-item-copy">
                                                <strong className="rich-subsection-item-title">{item.title}</strong>
                                                {(item.metaPrimary || item.metaSecondary) ? (
                                                    <div className="rich-subsection-item-meta">
                                                        {[item.metaPrimary, item.metaSecondary].filter(Boolean).join(' · ')}
                                                    </div>
                                                ) : null}
                                            </div>
                                            {item.actionLinks.length > 0 ? (
                                                <div className="rich-summary-actions inline">
                                                    {item.actionLinks.map((link, linkIndex) => (
                                                        <a
                                                            key={`subsection-link-${blockIndex}-${itemIndex}-${linkIndex}`}
                                                            href={link.href}
                                                            className={`rich-summary-action ${linkClassName}`}
                                                            target={link.href.startsWith('http') ? '_blank' : undefined}
                                                            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                                        >
                                                            {link.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                }

                if (block.type === 'heading') {
                    const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
                    return (
                        <Tag key={`heading-${blockIndex}`} className={`rich-heading level-${block.level}`}>
                            {parseInlineContent(block.content, `heading-${blockIndex}`, linkClassName)}
                        </Tag>
                    );
                }

                if (block.type === 'paragraph') {
                    return (
                        <p key={`paragraph-${blockIndex}`} className="rich-paragraph">
                            {parseInlineContent(block.content, `paragraph-${blockIndex}`, linkClassName)}
                        </p>
                    );
                }

                if (block.type === 'quote') {
                    return (
                        <blockquote key={`quote-${blockIndex}`} className="rich-quote">
                            {block.content.split('\n').map((line, lineIndex) => (
                                <span key={`quote-line-${blockIndex}-${lineIndex}`}>
                                    {parseInlineContent(line, `quote-${blockIndex}-${lineIndex}`, linkClassName)}
                                    {lineIndex < block.content.split('\n').length - 1 ? <br /> : null}
                                </span>
                            ))}
                        </blockquote>
                    );
                }

                if (block.type === 'code') {
                    return (
                        <pre key={`code-${blockIndex}`} className="rich-code-block">
                            <code>{block.content}</code>
                        </pre>
                    );
                }

                if (block.type === 'table') {
                    return (
                        <div key={`table-${blockIndex}`} className="rich-table-wrap">
                            <table className="rich-table">
                                <thead>
                                    <tr>
                                        {block.header.map((cell, cellIndex) => (
                                            <th key={`table-head-${blockIndex}-${cellIndex}`}>
                                                {parseInlineContent(cell, `table-head-${blockIndex}-${cellIndex}`, linkClassName)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {block.rows.map((row, rowIndex) => (
                                        <tr key={`table-row-${blockIndex}-${rowIndex}`}>
                                            {block.header.map((_, cellIndex) => (
                                                <td key={`table-cell-${blockIndex}-${rowIndex}-${cellIndex}`}>
                                                    {parseInlineContent(row[cellIndex] || '', `table-cell-${blockIndex}-${rowIndex}-${cellIndex}`, linkClassName)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }

                if (block.type === 'list') {
                    const ListTag = block.ordered ? 'ol' : 'ul';
                    return (
                        <ListTag key={`list-${blockIndex}`} className={`rich-list ${block.ordered ? 'ordered' : 'unordered'}`}>
                            {block.items.map((item, itemIndex) => (
                                <li key={`list-item-${blockIndex}-${itemIndex}`}>
                                    {parseInlineContent(item, `list-${blockIndex}-${itemIndex}`, linkClassName)}
                                </li>
                            ))}
                        </ListTag>
                    );
                }

                return null;
            })}
        </div>
    );
}

export function buildUnreadSummary(items = [], formatter = () => '') {
    if (!items.length) {
        return '当前没有未读消息。';
    }

    const visibleItems = items.slice(0, MESSAGE_SUMMARY_LIMIT);
    const lines = [
        `当前共有 ${items.length} 条未读消息，以下展示最近 ${visibleItems.length} 条。[查看更多](/messages)`,
        ...visibleItems.map((item) => {
            const detailPath = `/messages/${encodeURIComponent(item.id)}`;
            const rawOriginalLink = /^https?:\/\//.test(item.href || '')
                ? item.href
                : (item.pathname || item.href || '');
            const actionLinks = [
                `[查看详情](${detailPath})`,
            ];

            if (rawOriginalLink) {
                actionLinks.push(`[原链接](${rawOriginalLink})`);
            }

            return `- [${item.sourceLabel}] ${item.title}（${formatter(item.createdAt, true)}） ${actionLinks.join(' · ')}`;
        }),
    ];

    return lines.join('\n');
}

export function buildApprovalSummary({
    pending = [],
    pendingCount = pending.length,
    initiated = [],
    initiatedCount = initiated.length,
    records = [],
    recordsByStatus = {},
    recordCountsByStatus = {},
    formatter = () => '',
} = {}) {
    const sections = [];
    const buildSection = ({
        label,
        items = [],
        total = items.length,
        emptyText,
        link = APPROVAL_CENTER_LINK,
    }) => {
        if (!items.length) {
            return emptyText;
        }

        const visibleItems = items.slice(0, APPROVAL_SUMMARY_LIMIT);

        return [
            `${label}：共 ${total} 条，以下展示最近 ${visibleItems.length} 条。[查看更多](${link})`,
            ...visibleItems.map((item) => {
                const links = [];
                if (item.href) {
                    links.push(`[打开审批](${item.href})`);
                }

                return `- ${item.title}（${item.statusLabel}，${formatter(item.updatedAt, true)}）${links.length ? ` ${links.join(' · ')}` : ''}`;
            }),
        ].join('\n');
    };

    sections.push(buildSection({
        label: '待我审批',
        items: pending,
        total: pendingCount,
        emptyText: '待我审批：当前没有待处理审批。',
    }));

    sections.push(buildSection({
        label: '我发起的',
        items: initiated,
        total: initiatedCount,
        emptyText: '我发起的：当前没有可展示的发起记录。',
    }));

    sections.push(buildSection({
        label: '已审批',
        items: recordsByStatus.approved || [],
        total: recordCountsByStatus.approved || 0,
        emptyText: '已审批：当前没有可展示记录。',
    }));

    sections.push(buildSection({
        label: '抄送我',
        items: recordsByStatus.copied || [],
        total: recordCountsByStatus.copied || 0,
        emptyText: '抄送我：当前没有可展示记录。',
    }));

    sections.push(buildSection({
        label: '他人已处理',
        items: recordsByStatus.othersProcessed || records,
        total: recordCountsByStatus.othersProcessed || records.length,
        emptyText: '他人已处理：当前没有可展示记录。',
    }));

    return sections.join('\n\n');
}
