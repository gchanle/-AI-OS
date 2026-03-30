import fs from 'fs';
import path from 'path';

const SKILL_PACKAGE_ROOT = path.join(process.cwd(), 'capability-packages', 'skills');
const REQUIRED_FRONTMATTER_KEYS = [
    'id',
    'title',
    'description',
    'capability',
    'owner',
    'origin',
    'provider',
    'version',
    'entry',
    'status',
    'market_status',
];
const REQUIRED_SECTIONS = ['Purpose', 'Inputs', 'Workflow', 'Outputs', 'Safety'];

function ensureSkillPackageRoot() {
    fs.mkdirSync(SKILL_PACKAGE_ROOT, { recursive: true });
}

function parseScalar(rawValue) {
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

function parseFrontmatter(block = '') {
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

function splitMarkdownDocument(source = '') {
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

function extractSections(body = '') {
    const matches = [...body.matchAll(/^##\s+(.+)$/gm)];
    return matches.map((match) => String(match[1] || '').trim());
}

function extractHeading(body = '') {
    const match = body.match(/^#\s+(.+)$/m);
    return match ? String(match[1] || '').trim() : '';
}

function slugifySkillId(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '') || 'skill-draft';
}

export function getSkillPackageRoot() {
    ensureSkillPackageRoot();
    return SKILL_PACKAGE_ROOT;
}

export function getSkillPackageFilePath(skillId) {
    const normalizedId = slugifySkillId(skillId);
    return path.join(getSkillPackageRoot(), normalizedId, 'SKILL.md');
}

export function validateSkillPackageSource(source = '', relativePath = '') {
    const { metadata, body, hasFrontmatter } = splitMarkdownDocument(source);
    const sections = extractSections(body);
    const heading = extractHeading(body);
    const errors = [];
    const warnings = [];

    if (!hasFrontmatter) {
        errors.push('缺少 frontmatter 元信息块。');
    }

    REQUIRED_FRONTMATTER_KEYS.forEach((key) => {
        if (metadata[key] === undefined || metadata[key] === null || metadata[key] === '' || (Array.isArray(metadata[key]) && metadata[key].length === 0)) {
            errors.push(`缺少必填元信息：${key}`);
        }
    });

    const missingSections = REQUIRED_SECTIONS.filter((section) => !sections.includes(section));
    missingSections.forEach((section) => {
        errors.push(`缺少必填章节：${section}`);
    });

    if (!heading) {
        errors.push('缺少一级标题（# Title）。');
    } else if (metadata.title && heading !== metadata.title) {
        warnings.push('一级标题与 frontmatter.title 不一致。');
    }

    if (metadata.entry && metadata.entry !== 'SKILL.md') {
        warnings.push('当前原型阶段要求 entry 固定为 SKILL.md。');
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
        missingSections,
        relativePath,
        validation: {
            state: validationState,
            label: validationLabel,
            errors,
            warnings,
        },
    };
}

export function buildSkillPackageMarkdown(skill = {}) {
    const connectors = Array.isArray(skill.connectorIds) ? skill.connectorIds : [];
    const invocationModes = Array.isArray(skill.invocationModes) ? skill.invocationModes : [];
    const prompts = Array.isArray(skill.suggestedPrompts) ? skill.suggestedPrompts : [];

    const frontmatterLines = [
        '---',
        `id: ${skill.id}`,
        `title: ${skill.name || '未命名技能'}`,
        `description: ${skill.summary || '待补充描述'}`,
        `capability: ${skill.targetCapabilityId || 'services'}`,
        `owner: ${skill.owner || '未分配'}`,
        `origin: ${skill.origin || 'personal'}`,
        `provider: ${skill.provider || '当前租户'}`,
        `version: ${skill.version || '1.0.0'}`,
        'entry: SKILL.md',
        `status: ${skill.status || 'draft'}`,
        `market_status: ${skill.marketStatus || 'private'}`,
        `firefly_enabled: ${Boolean(skill.fireflyEnabled)}`,
        `audience: ${skill.audience || '校园用户'}`,
        'connectors:',
        ...(connectors.length > 0 ? connectors.map((item) => `  - ${item}`) : ['  - none']),
        'invocation_modes:',
        ...(invocationModes.length > 0 ? invocationModes.map((item) => `  - ${item}`) : ['  - chat']),
        '---',
    ];

    const promptsBlock = prompts.length > 0
        ? prompts.map((prompt) => `- ${prompt}`).join('\n')
        : '- 待补充推荐问法';

    const bodyLines = [
        `# ${skill.name || '未命名技能'}`,
        '',
        '## Purpose',
        skill.description || skill.summary || '待补充技能用途。',
        '',
        '## Inputs',
        `- 归属能力：${skill.targetCapabilityId || 'services'}`,
        `- 适用对象：${skill.audience || '校园用户'}`,
        `- 推荐问法：`,
        promptsBlock,
        '',
        '## Workflow',
        connectors.length > 0
            ? `- 当前依赖连接器：${connectors.join('、')}\n- 先由萤火虫判断是否需要调用该技能，再根据连接器或工作流完成处理。`
            : '- 当前为无连接器依赖的能力包，可作为提示词工作流或审核治理能力使用。',
        '',
        '## Outputs',
        '- 输出给萤火虫的应是结构化结论、下一步建议或可解释回执。',
        '- 如果没有真实系统返回，必须明确说明当前仅为草稿或建议。',
        '',
        '## Safety',
        '- 不得越过现有授权边界直接访问系统。',
        '- 涉及写操作或敏感数据时，必须交回连接器授权模型确认。',
    ];

    return `${frontmatterLines.join('\n')}\n${bodyLines.join('\n')}\n`;
}

export function readSkillPackageFile(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    const validation = validateSkillPackageSource(source, relativePath);

    return {
        id: validation.metadata.id || path.basename(path.dirname(filePath)),
        title: validation.metadata.title || validation.heading || path.basename(path.dirname(filePath)),
        description: validation.metadata.description || '',
        capability: validation.metadata.capability || 'services',
        owner: validation.metadata.owner || '',
        origin: validation.metadata.origin || 'personal',
        provider: validation.metadata.provider || '',
        version: validation.metadata.version || '1.0.0',
        entry: validation.metadata.entry || 'SKILL.md',
        status: validation.metadata.status || 'draft',
        marketStatus: validation.metadata.market_status || 'private',
        fireflyEnabled: Boolean(validation.metadata.firefly_enabled),
        audience: validation.metadata.audience || '',
        connectors: Array.isArray(validation.metadata.connectors) ? validation.metadata.connectors.filter((item) => item !== 'none') : [],
        invocationModes: Array.isArray(validation.metadata.invocation_modes) ? validation.metadata.invocation_modes : [],
        relativePath,
        packageDir: path.relative(process.cwd(), path.dirname(filePath)),
        sections: validation.sections,
        missingSections: validation.missingSections,
        validation: validation.validation,
    };
}

export function listSkillPackages() {
    ensureSkillPackageRoot();

    const packageDirs = fs.readdirSync(SKILL_PACKAGE_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(SKILL_PACKAGE_ROOT, entry.name));

    return packageDirs
        .map((dir) => path.join(dir, 'SKILL.md'))
        .filter((filePath) => fs.existsSync(filePath))
        .map((filePath) => readSkillPackageFile(filePath))
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export function upsertSkillPackage(skill = {}) {
    const normalizedId = slugifySkillId(skill.id || skill.name || 'skill-draft');
    const packageDir = path.join(getSkillPackageRoot(), normalizedId);
    const filePath = path.join(packageDir, 'SKILL.md');
    fs.mkdirSync(packageDir, { recursive: true });

    const nextMarkdown = buildSkillPackageMarkdown({
        ...skill,
        id: normalizedId,
    });

    fs.writeFileSync(filePath, nextMarkdown, 'utf8');
    return readSkillPackageFile(filePath);
}
