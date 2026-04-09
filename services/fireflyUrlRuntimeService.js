const DIRECT_URL_REGEX = /https?:\/\/[^\s<>"'`)\]}，。！？；：]+/ig;

function decodeHtmlEntities(input = '') {
    return input
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function stripHtml(input = '') {
    return decodeHtmlEntities(
        String(input || '')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function truncate(text = '', limit = 240) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) {
        return clean;
    }

    return `${clean.slice(0, limit)}...`;
}

function sanitizeUrlCandidate(value = '') {
    return String(value || '').trim().replace(/[),.;!?]+$/g, '');
}

function unique(values = []) {
    return Array.from(new Set(values.filter(Boolean)));
}

function getHostname(url = '') {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function getPathname(url = '') {
    try {
        return new URL(url).pathname.toLowerCase();
    } catch {
        return '';
    }
}

function isLikelyInteractivePath(pathname = '') {
    return /\/(login|signin|oauth|auth|approve|approval|workflow|form|edit|new|create|submit|dashboard|manage|admin)(\/|$)/i.test(pathname);
}

function extractMetaContent(html = '', selector = '') {
    if (!selector) {
        return '';
    }

    const attribute = selector === 'og:title' || selector === 'og:description'
        ? 'property'
        : 'name';
    const match = html.match(new RegExp(`<meta[^>]+${attribute}=["']${selector}["'][^>]+content=["']([^"']+)["']`, 'i'));
    return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function extractTitle(html = '') {
    const ogTitle = extractMetaContent(html, 'og:title');
    if (ogTitle) {
        return ogTitle;
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return titleMatch ? stripHtml(titleMatch[1]) : '';
}

function extractParagraphs(html = '', { minLength = 24, limit = 12 } = {}) {
    const paragraphMatches = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
    const paragraphs = paragraphMatches
        .map((item) => stripHtml(item))
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter((item) => item.length >= minLength);

    return unique(paragraphs).slice(0, limit);
}

function extractWeixinContent(html = '') {
    const title = extractMetaContent(html, 'og:title')
        || stripHtml((html.match(/var\s+msg_title\s*=\s*'([^']+)'/i) || [])[1] || '')
        || extractTitle(html);
    const description = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description');
    const paragraphs = extractParagraphs(html, { minLength: 18, limit: 18 })
        .filter((item) => !/^(参数错误|视频|小程序|赞|在看|分享|留言|收藏|听过)$/.test(item));
    const excerpt = paragraphs.join('\n\n').trim();

    return {
        title,
        description,
        excerpt,
        extractionKind: excerpt.length >= 180 ? 'site_adapter' : 'site_adapter_shell_only',
    };
}

function extractGenericArticle(html = '') {
    const title = extractTitle(html);
    const description = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description');
    const paragraphs = extractParagraphs(html, { minLength: 28, limit: 16 });
    const excerpt = paragraphs.join('\n\n').trim();

    return {
        title,
        description,
        excerpt,
        extractionKind: excerpt.length >= 180 ? 'generic_reader' : 'generic_shell_only',
    };
}

function buildDomainHints(hostname = '', pathname = '') {
    const hints = [];

    if (hostname.includes('mp.weixin.qq.com')) {
        hints.push('微信公众号文章通常存在反爬或壳页返回。');
    }

    if (isLikelyInteractivePath(pathname)) {
        hints.push('链接路径看起来更像交互页面，而不是纯内容页。');
    }

    if (hostname.includes('office.chaoxing.com') || hostname.includes('hall.chaoxing.com')) {
        hints.push('该域名通常带有登录态和业务操作流程。');
    }

    return hints;
}

function buildUrlProfile(url = '') {
    const hostname = getHostname(url);
    const pathname = getPathname(url);
    const isWeixinArticle = hostname.includes('mp.weixin.qq.com');
    const interactionMode = isLikelyInteractivePath(pathname) ? 'interactive' : 'read';
    const siteKind = isWeixinArticle
        ? 'wechat_article'
        : interactionMode === 'interactive'
            ? 'app_page'
            : 'generic_page';

    return {
        url,
        hostname,
        pathname,
        siteKind,
        interactionMode,
        hints: buildDomainHints(hostname, pathname),
    };
}

async function fetchHtml(url = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            cache: 'no-store',
            signal: controller.signal,
        });
        const html = await response.text();

        return {
            ok: response.ok,
            status: response.status,
            finalUrl: response.url || url,
            contentType: response.headers.get('content-type') || '',
            headers: {
                logicRet: response.headers.get('logicret') || '',
                verifyResult: response.headers.get('mmlas-verifyresult') || '',
            },
            html,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function inferReadStatus({
    profile = {},
    fetchResult = {},
    excerpt = '',
    extractionKind = '',
}) {
    const limitations = [];
    let recommendedAction = 'page.read';
    let recommendedCapability = 'direct_read';
    let quality = excerpt.length >= 600 ? 'high' : excerpt.length >= 200 ? 'medium' : 'low';

    if (!fetchResult.ok) {
        limitations.push(`页面请求返回 ${fetchResult.status || '未知状态'}。`);
        return {
            quality: 'blocked',
            recommendedAction: 'web.search',
            recommendedCapability: 'search_fallback',
            limitations,
        };
    }

    if (profile.interactionMode === 'interactive') {
        limitations.push('该链接更像交互页面，纯文本抓取通常不够。');
        recommendedAction = 'page.act';
        recommendedCapability = 'interactive_page';
    }

    if (fetchResult.headers.logicRet && fetchResult.headers.logicRet !== '0') {
        limitations.push(`目标站点返回了受限信号（logicret=${fetchResult.headers.logicRet}）。`);
        recommendedAction = 'browser.read';
        recommendedCapability = 'browser_required';
        quality = 'blocked';
    }

    if (!excerpt) {
        limitations.push('当前只拿到了页面壳内容，未提取到稳定正文。');
        recommendedAction = recommendedCapability === 'interactive_page' ? 'page.act' : 'browser.read';
        recommendedCapability = recommendedCapability === 'interactive_page' ? 'interactive_page' : 'browser_required';
        quality = 'blocked';
    } else if (extractionKind.endsWith('shell_only')) {
        limitations.push('已抓到部分文本，但更像页面壳或零散片段，结论可信度有限。');
        quality = 'low';
    }

    return {
        quality,
        recommendedAction,
        recommendedCapability,
        limitations,
    };
}

export function extractDirectUrls(text = '') {
    const matches = String(text || '').match(DIRECT_URL_REGEX) || [];
    return unique(matches.map(sanitizeUrlCandidate));
}

export function inspectDirectUrl(question = '') {
    const urls = extractDirectUrls(question);
    if (!urls.length) {
        return null;
    }

    const primaryUrl = urls[0];
    const profile = buildUrlProfile(primaryUrl);

    return {
        target: profile,
        urls,
        summary: profile.interactionMode === 'interactive'
            ? `已识别链接：${profile.hostname}，更像交互页。`
            : `已识别链接：${profile.hostname}。`,
    };
}

export async function readDirectUrl(url = '') {
    const profile = buildUrlProfile(url);
    const fetchResult = await fetchHtml(url);
    const html = String(fetchResult.html || '');
    const extraction = profile.siteKind === 'wechat_article'
        ? extractWeixinContent(html)
        : extractGenericArticle(html);
    const decision = inferReadStatus({
        profile,
        fetchResult,
        excerpt: extraction.excerpt,
        extractionKind: extraction.extractionKind,
    });

    return {
        target: profile,
        fetch: {
            status: fetchResult.status,
            finalUrl: fetchResult.finalUrl,
            contentType: fetchResult.contentType,
            headers: fetchResult.headers,
        },
        page: {
            title: extraction.title || profile.hostname || '未命名页面',
            description: extraction.description,
            excerpt: extraction.excerpt,
            extractionKind: extraction.extractionKind,
        },
        decision,
    };
}

export function buildUrlInspectionMarkdown(inspectResult = null) {
    if (!inspectResult?.target) {
        return '### URL 识别\n当前消息里没有识别到可处理的链接。';
    }

    const { target } = inspectResult;
    const lines = [
        '### URL 识别',
        `- 域名：${target.hostname || '未知域名'}`,
        `- 类型：${target.siteKind === 'wechat_article' ? '内容页 / 公众号文章' : target.siteKind === 'app_page' ? '业务交互页' : '通用页面'}`,
        `- 当前判断：${target.interactionMode === 'interactive' ? '更像交互页' : '更像内容页'}`,
    ];

    if (target.hints.length) {
        lines.push('', '### 初步信号');
        target.hints.forEach((item) => {
            lines.push(`- ${item}`);
        });
    }

    return lines.join('\n');
}

export function buildUrlReadMarkdown(readResult = null) {
    if (!readResult?.target) {
        return '### 页面读取\n当前没有可展示的页面读取结果。';
    }

    const { page, decision, target, fetch } = readResult;
    const lines = [
        '### 页面读取结果',
        `- 标题：${page.title || '未识别标题'}`,
        `- 读取质量：${decision.quality === 'high' ? '高' : decision.quality === 'medium' ? '中' : decision.quality === 'low' ? '低' : '受限'}`,
        `- 推荐通道：${decision.recommendedAction === 'page.read' ? '直接读取' : decision.recommendedAction === 'page.act' ? '交互执行' : decision.recommendedAction === 'browser.read' ? '浏览器读取' : '搜索补充'}`,
        `- 提取方式：${page.extractionKind || 'unknown'}`,
    ];

    if (page.excerpt) {
        lines.push('', '### 提取到的正文片段', truncate(page.excerpt, 900));
    }

    if (decision.limitations.length) {
        lines.push('', '### 当前限制');
        decision.limitations.forEach((item) => {
            lines.push(`- ${item}`);
        });
    }

    lines.push('', `[打开原链接](${fetch.finalUrl || target.url})`);
    return lines.join('\n');
}
