import fs from 'fs';
import path from 'path';
import {
    ensurePackageRoot,
    slugifyCapabilityId,
    validateMarkdownCapabilityPackage,
} from '@/lib/capabilityPackageShared';

const CLI_PACKAGE_ROOT = path.join(process.cwd(), 'capability-packages', 'cli');
const CLI_ENTRY_FILE = 'CLI.md';
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
    'runner_type',
    'execution_mode',
    'command',
];
const REQUIRED_SECTIONS = ['Purpose', 'Inputs', 'Outputs', 'Install', 'Safety'];

export function getCliPackageRoot() {
    ensurePackageRoot(CLI_PACKAGE_ROOT);
    return CLI_PACKAGE_ROOT;
}

export function getCliPackageFilePath(cliId) {
    const normalizedId = slugifyCapabilityId(cliId, 'cli-draft');
    return path.join(getCliPackageRoot(), normalizedId, CLI_ENTRY_FILE);
}

export function validateCliPackageSource(source = '', relativePath = '') {
    return validateMarkdownCapabilityPackage(source, {
        requiredFrontmatterKeys: REQUIRED_FRONTMATTER_KEYS,
        requiredSections: REQUIRED_SECTIONS,
        relativePath,
        expectedEntry: CLI_ENTRY_FILE,
        titleField: 'title',
    });
}

export function buildCliPackageMarkdown(cli = {}) {
    const authModes = Array.isArray(cli.authModes) ? cli.authModes : [];
    const supportedOs = Array.isArray(cli.supportedOs) ? cli.supportedOs : [];
    const expectedInputs = Array.isArray(cli.expectedInputs) ? cli.expectedInputs : [];
    const expectedOutputs = Array.isArray(cli.expectedOutputs) ? cli.expectedOutputs : [];
    const risks = Array.isArray(cli.risks) ? cli.risks : [];

    const frontmatterLines = [
        '---',
        `id: ${cli.id}`,
        `title: ${cli.name || '未命名 CLI'}`,
        `description: ${cli.summary || '待补充描述'}`,
        `capability: ${cli.capabilityId || 'services'}`,
        `owner: ${cli.owner || '待分配'}`,
        `provider: ${cli.provider || '当前租户'}`,
        `version: ${cli.version || '1.0.0'}`,
        `entry: ${CLI_ENTRY_FILE}`,
        `status: ${cli.status || 'design'}`,
        `runner_type: ${cli.runnerType || 'desktop_agent'}`,
        `execution_mode: ${cli.executionMode || 'user_session'}`,
        `command: ${cli.command || ''}`,
        `package_ref: ${cli.packageRef || ''}`,
        `working_directory: ${cli.workingDirectory || ''}`,
        'auth_modes:',
        ...(authModes.length > 0 ? authModes.map((item) => `  - ${item}`) : ['  - vault_secret']),
        'supported_os:',
        ...(supportedOs.length > 0 ? supportedOs.map((item) => `  - ${item}`) : ['  - Linux']),
        '---',
    ];

    const inputBlock = expectedInputs.length > 0
        ? expectedInputs.map((item) => `- ${item}`).join('\n')
        : '- 待补充输入声明';
    const outputBlock = expectedOutputs.length > 0
        ? expectedOutputs.map((item) => `- ${item}`).join('\n')
        : '- 待补充输出声明';
    const authBlock = authModes.length > 0
        ? authModes.map((item) => `- ${item}`).join('\n')
        : '- 待补充授权方式';
    const osBlock = supportedOs.length > 0
        ? supportedOs.map((item) => `- ${item}`).join('\n')
        : '- 待补充运行环境';
    const riskBlock = risks.length > 0
        ? risks.map((item) => `- ${item}`).join('\n')
        : '- 待补充安全边界';

    const bodyLines = [
        `# ${cli.name || '未命名 CLI'}`,
        '',
        '## Purpose',
        cli.summary || '待补充执行对象用途。',
        '',
        '## Inputs',
        inputBlock,
        '',
        '## Outputs',
        outputBlock,
        '',
        '## Install',
        `- 命令：${cli.command || '待补充'}`,
        `- 工作目录：${cli.workingDirectory || '待补充'}`,
        `- Package Ref：${cli.packageRef || '待补充'}`,
        cli.installGuide ? `- 安装说明：${cli.installGuide}` : '- 安装说明待补充',
        `- 支持环境：\n${osBlock}`,
        '',
        '## Safety',
        authBlock,
        riskBlock,
        cli.governanceNote ? `- 治理说明：${cli.governanceNote}` : '- 治理说明待补充',
    ];

    return `${frontmatterLines.join('\n')}\n${bodyLines.join('\n')}\n`;
}

export function readCliPackageFile(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    const parsed = validateCliPackageSource(source, relativePath);
    const metadata = parsed.metadata || {};

    return {
        id: metadata.id || path.basename(path.dirname(filePath)),
        title: metadata.title || parsed.heading || path.basename(path.dirname(filePath)),
        description: metadata.description || '',
        capability: metadata.capability || 'services',
        owner: metadata.owner || '',
        provider: metadata.provider || '',
        version: metadata.version || '1.0.0',
        entry: metadata.entry || CLI_ENTRY_FILE,
        status: metadata.status || 'design',
        runnerType: metadata.runner_type || 'desktop_agent',
        executionMode: metadata.execution_mode || 'user_session',
        command: metadata.command || '',
        packageRef: metadata.package_ref || '',
        workingDirectory: metadata.working_directory || '',
        authModes: Array.isArray(metadata.auth_modes) ? metadata.auth_modes.filter((item) => item !== 'none') : [],
        supportedOs: Array.isArray(metadata.supported_os) ? metadata.supported_os.filter((item) => item !== 'none') : [],
        relativePath,
        packageDir: path.relative(process.cwd(), path.dirname(filePath)),
        sections: parsed.sections,
        validation: parsed.validation,
    };
}

export function listCliPackages() {
    ensurePackageRoot(CLI_PACKAGE_ROOT);

    const packageDirs = fs.readdirSync(CLI_PACKAGE_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(CLI_PACKAGE_ROOT, entry.name));

    return packageDirs
        .map((dir) => path.join(dir, CLI_ENTRY_FILE))
        .filter((filePath) => fs.existsSync(filePath))
        .map((filePath) => readCliPackageFile(filePath))
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export function upsertCliPackage(cli = {}) {
    const normalizedId = slugifyCapabilityId(cli.id || cli.name || 'cli-draft', 'cli-draft');
    const packageDir = path.join(getCliPackageRoot(), normalizedId);
    const filePath = path.join(packageDir, CLI_ENTRY_FILE);
    fs.mkdirSync(packageDir, { recursive: true });

    const nextMarkdown = buildCliPackageMarkdown({
        ...cli,
        id: normalizedId,
    });

    fs.writeFileSync(filePath, nextMarkdown, 'utf8');
    return readCliPackageFile(filePath);
}
