import fs from 'fs';

export function ensurePackageRoot(rootPath) {
    fs.mkdirSync(rootPath, { recursive: true });
}

export function parseScalar(rawValue) {
    const value = String(rawValue || '').trim();
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === '') return '';
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

export function parseFrontmatter(block = '') {
    const result = {};
    let currentKey = null;

    block.split('\n').forEach((line) => {
        if (!line.trim()) {
            return;
        }

        const listMatch = line.match(/^\s*-\s+(.*)$/);
        if (listMatch && currentKey) {
            if (!Array.isArray(result[currentKey])) {
                result[currentKey] = [];
            }
            result[currentKey].push(parseScalar(listMatch[1]));
            return;
        }

        const fieldMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!fieldMatch) {
            return;
        }

        const [, key, rawValue] = fieldMatch;
        if (rawValue === '') {
            result[key] = [];
            currentKey = key;
            return;
        }

        result[key] = parseScalar(rawValue);
        currentKey = key;
    });

    return result;
}

export function splitMarkdownDocument(source = '') {
    const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
        return {
            metadata: {},
            body: source,
            hasFrontmatter: false,
        };
    }

    return {
        metadata: parseFrontmatter(match[1]),
        body: match[2] || '',
        hasFrontmatter: true,
    };
}

export function extractSections(body = '') {
    const matches = [...body.matchAll(/^##\s+(.+)$/gm)];
    return matches.map((match) => String(match[1] || '').trim());
}

export function extractHeading(body = '') {
    const match = body.match(/^#\s+(.+)$/m);
    return match ? String(match[1] || '').trim() : '';
}

export function slugifyCapabilityId(value = '', fallback = 'package-draft') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '') || fallback;
}

export function validateMarkdownCapabilityPackage(source = '', options = {}) {
    const {
        requiredFrontmatterKeys = [],
        requiredSections = [],
        relativePath = '',
        expectedEntry = '',
        titleField = 'title',
    } = options;
    const { metadata, body, hasFrontmatter } = splitMarkdownDocument(source);
    const sections = extractSections(body);
    const heading = extractHeading(body);
    const errors = [];
    const warnings = [];

    if (!hasFrontmatter) {
        errors.push('缺少 frontmatter 元信息块。');
    }

    requiredFrontmatterKeys.forEach((key) => {
        if (metadata[key] === undefined || metadata[key] === null || metadata[key] === '' || (Array.isArray(metadata[key]) && metadata[key].length === 0)) {
            errors.push(`缺少必填元信息：${key}`);
        }
    });

    requiredSections
        .filter((section) => !sections.includes(section))
        .forEach((section) => {
            errors.push(`缺少必填章节：${section}`);
        });

    if (!heading) {
        errors.push('缺少一级标题（# Title）。');
    } else if (metadata[titleField] && heading !== metadata[titleField]) {
        warnings.push('一级标题与 frontmatter 标题字段不一致。');
    }

    if (expectedEntry && metadata.entry && metadata.entry !== expectedEntry) {
        warnings.push(`当前原型阶段要求 entry 固定为 ${expectedEntry}。`);
    }

    const validationState = errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid';
    const validationLabel = validationState === 'valid'
        ? '规范通过'
        : validationState === 'warning'
            ? '可用但需复核'
            : '未通过校验';

    return {
        metadata,
        body,
        heading,
        sections,
        relativePath,
        validation: {
            state: validationState,
            label: validationLabel,
            errors,
            warnings,
        },
    };
}
