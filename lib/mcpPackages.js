import fs from 'fs';
import path from 'path';
import {
    ensurePackageRoot,
    slugifyCapabilityId,
    validateMarkdownCapabilityPackage,
} from '@/lib/capabilityPackageShared';

const MCP_PACKAGE_ROOT = path.join(process.cwd(), 'capability-packages', 'mcp');
const MCP_ENTRY_FILE = 'MCP.md';
const REQUIRED_FRONTMATTER_KEYS = [
    'id',
    'title',
    'description',
    'capability',
    'owner',
    'provider',
    'version',
    'entry',
    'status',
    'transport',
    'protocol_version',
    'manifest_path',
];
const REQUIRED_SECTIONS = ['Purpose', 'Contract', 'Auth', 'Tools', 'Resources', 'Safety'];

export function getMcpPackageRoot() {
    ensurePackageRoot(MCP_PACKAGE_ROOT);
    return MCP_PACKAGE_ROOT;
}

export function getMcpPackageFilePath(mcpId) {
    const normalizedId = slugifyCapabilityId(mcpId, 'mcp-draft');
    return path.join(getMcpPackageRoot(), normalizedId, MCP_ENTRY_FILE);
}

export function validateMcpPackageSource(source = '', relativePath = '') {
    return validateMarkdownCapabilityPackage(source, {
        requiredFrontmatterKeys: REQUIRED_FRONTMATTER_KEYS,
        requiredSections: REQUIRED_SECTIONS,
        relativePath,
        expectedEntry: MCP_ENTRY_FILE,
        titleField: 'title',
    });
}

export function buildMcpPackageMarkdown(mcp = {}) {
    const authModes = Array.isArray(mcp.authModes) ? mcp.authModes : [];
    const expectedTools = Array.isArray(mcp.expectedTools) ? mcp.expectedTools : [];
    const expectedResources = Array.isArray(mcp.expectedResources) ? mcp.expectedResources : [];
    const risks = Array.isArray(mcp.risks) ? mcp.risks : [];

    const frontmatterLines = [
        '---',
        `id: ${mcp.id}`,
        `title: ${mcp.name || '未命名 MCP'}`,
        `description: ${mcp.summary || '待补充描述'}`,
        `capability: ${mcp.capabilityId || 'services'}`,
        `owner: ${mcp.owner || '待分配'}`,
        `provider: ${mcp.provider || '当前租户'}`,
        `version: ${mcp.version || '1.0.0'}`,
        `entry: ${MCP_ENTRY_FILE}`,
        `status: ${mcp.status || 'design'}`,
        `transport: ${mcp.transport || 'streamable_http'}`,
        `protocol_version: ${mcp.protocolVersion || '2026-03-01'}`,
        `manifest_path: ${mcp.manifestPath || '/.well-known/mcp.json'}`,
        `endpoint: ${mcp.endpoint || ''}`,
        `scope: ${mcp.scope || ''}`,
        'auth_modes:',
        ...(authModes.length > 0 ? authModes.map((item) => `  - ${item}`) : ['  - sso_session']),
        'expected_tools:',
        ...(expectedTools.length > 0 ? expectedTools.map((item) => `  - ${item}`) : ['  - none']),
        'expected_resources:',
        ...(expectedResources.length > 0 ? expectedResources.map((item) => `  - ${item}`) : ['  - none']),
        '---',
    ];

    const toolsBlock = expectedTools.length > 0
        ? expectedTools.map((item) => `- ${item}`).join('\n')
        : '- 待补充工具声明';
    const resourcesBlock = expectedResources.length > 0
        ? expectedResources.map((item) => `- ${item}`).join('\n')
        : '- 待补充资源声明';
    const authBlock = authModes.length > 0
        ? authModes.map((item) => `- ${item}`).join('\n')
        : '- 待补充认证方式';
    const riskBlock = risks.length > 0
        ? risks.map((item) => `- ${item}`).join('\n')
        : '- 待补充风险说明';

    const bodyLines = [
        `# ${mcp.name || '未命名 MCP'}`,
        '',
        '## Purpose',
        mcp.summary || '待补充接入目的。',
        '',
        '## Contract',
        `- Transport：${mcp.transport || 'streamable_http'}`,
        `- Protocol Version：${mcp.protocolVersion || '2026-03-01'}`,
        `- Endpoint：${mcp.endpoint || '待补充'}`,
        `- Manifest：${mcp.manifestPath || '/.well-known/mcp.json'}`,
        '',
        '## Auth',
        authBlock,
        '',
        '## Tools',
        toolsBlock,
        '',
        '## Resources',
        resourcesBlock,
        '',
        '## Safety',
        riskBlock,
        mcp.governanceNote ? `- 治理说明：${mcp.governanceNote}` : '- 治理说明待补充',
    ];

    return `${frontmatterLines.join('\n')}\n${bodyLines.join('\n')}\n`;
}

export function readMcpPackageFile(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    const parsed = validateMcpPackageSource(source, relativePath);
    const metadata = parsed.metadata || {};

    return {
        id: metadata.id || path.basename(path.dirname(filePath)),
        title: metadata.title || parsed.heading || path.basename(path.dirname(filePath)),
        description: metadata.description || '',
        capability: metadata.capability || 'services',
        owner: metadata.owner || '',
        provider: metadata.provider || '',
        version: metadata.version || '1.0.0',
        entry: metadata.entry || MCP_ENTRY_FILE,
        status: metadata.status || 'design',
        transport: metadata.transport || 'streamable_http',
        protocolVersion: metadata.protocol_version || '2026-03-01',
        manifestPath: metadata.manifest_path || '/.well-known/mcp.json',
        endpoint: metadata.endpoint || '',
        scope: metadata.scope || '',
        authModes: Array.isArray(metadata.auth_modes) ? metadata.auth_modes.filter((item) => item !== 'none') : [],
        expectedTools: Array.isArray(metadata.expected_tools) ? metadata.expected_tools.filter((item) => item !== 'none') : [],
        expectedResources: Array.isArray(metadata.expected_resources) ? metadata.expected_resources.filter((item) => item !== 'none') : [],
        relativePath,
        packageDir: path.relative(process.cwd(), path.dirname(filePath)),
        sections: parsed.sections,
        validation: parsed.validation,
    };
}

export function listMcpPackages() {
    ensurePackageRoot(MCP_PACKAGE_ROOT);

    const packageDirs = fs.readdirSync(MCP_PACKAGE_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(MCP_PACKAGE_ROOT, entry.name));

    return packageDirs
        .map((dir) => path.join(dir, MCP_ENTRY_FILE))
        .filter((filePath) => fs.existsSync(filePath))
        .map((filePath) => readMcpPackageFile(filePath))
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export function upsertMcpPackage(mcp = {}) {
    const normalizedId = slugifyCapabilityId(mcp.id || mcp.name || 'mcp-draft', 'mcp-draft');
    const packageDir = path.join(getMcpPackageRoot(), normalizedId);
    const filePath = path.join(packageDir, MCP_ENTRY_FILE);
    fs.mkdirSync(packageDir, { recursive: true });

    const nextMarkdown = buildMcpPackageMarkdown({
        ...mcp,
        id: normalizedId,
    });

    fs.writeFileSync(filePath, nextMarkdown, 'utf8');
    return readMcpPackageFile(filePath);
}
