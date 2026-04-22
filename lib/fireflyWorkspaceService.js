import { promises as fs } from 'fs';
import path from 'path';
import { buildFireflyThreadPaths } from '@/lib/fireflyThreadStateStore';

const MAX_LIST_ENTRIES = 60;
const MAX_READ_CHARS = 12000;

function normalizeRelativePath(value = '') {
    return String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\.\.(\/|\\)/g, '')
        .replace(/\/{2,}/g, '/');
}

function pickZoneRoot(paths, zone = 'workspace') {
    return zone === 'outputs' ? paths.outputsPath : paths.workspacePath;
}

function ensureSafeResolvedPath(basePath, relativePath = '') {
    const normalized = normalizeRelativePath(relativePath);
    const targetPath = path.resolve(basePath, normalized || '.');
    const safeBase = `${path.resolve(basePath)}${path.sep}`;

    if (targetPath !== path.resolve(basePath) && !targetPath.startsWith(safeBase)) {
        throw new Error('非法文件路径。');
    }

    return {
        normalized,
        targetPath,
    };
}

function buildWorkspaceHref({ threadKey = 'default', zone = 'workspace', relativePath = '' } = {}) {
    return `/api/firefly/runtime/workspace?threadKey=${encodeURIComponent(threadKey)}&zone=${encodeURIComponent(zone)}&path=${encodeURIComponent(relativePath)}`;
}

async function walkDir(basePath, currentPath = '', bucket = []) {
    if (bucket.length >= MAX_LIST_ENTRIES) {
        return bucket;
    }

    const { targetPath } = ensureSafeResolvedPath(basePath, currentPath);
    const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
        if (bucket.length >= MAX_LIST_ENTRIES) {
            break;
        }

        const relativePath = normalizeRelativePath(path.join(currentPath, entry.name));
        const absolutePath = path.join(basePath, relativePath);
        const stats = await fs.stat(absolutePath).catch(() => null);
        if (!stats) {
            continue;
        }

        bucket.push({
            name: entry.name,
            relativePath,
            kind: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            updatedAt: stats.mtime.toISOString(),
        });

        if (entry.isDirectory()) {
            await walkDir(basePath, relativePath, bucket);
        }
    }

    return bucket;
}

function inferMimeType(fileName = '') {
    const extension = path.extname(String(fileName || '').trim()).toLowerCase();
    if (extension === '.md') return 'text/markdown; charset=utf-8';
    if (extension === '.json') return 'application/json; charset=utf-8';
    if (extension === '.html') return 'text/html; charset=utf-8';
    return 'text/plain; charset=utf-8';
}

async function statIfExists(targetPath = '') {
    return fs.stat(targetPath).catch(() => null);
}

async function buildManifestEntries(basePath = '', zone = 'workspace') {
    const entries = await walkDir(basePath);
    return entries
        .filter((entry) => entry.kind === 'file')
        .map((entry) => ({
            zone,
            relativePath: entry.relativePath,
            name: entry.name,
            size: entry.size,
            updatedAt: entry.updatedAt,
            mimeType: inferMimeType(entry.name),
        }));
}

export async function listFireflyThreadWorkspace(threadKey = 'default') {
    const paths = buildFireflyThreadPaths(threadKey);
    const [workspaceEntries, outputEntries] = await Promise.all([
        walkDir(paths.workspacePath),
        walkDir(paths.outputsPath),
    ]);

    return {
        threadKey,
        workspacePath: paths.workspacePath,
        outputsPath: paths.outputsPath,
        workspaceEntries,
        outputEntries,
    };
}

export async function readFireflyThreadWorkspaceFile({
    threadKey = 'default',
    zone = 'workspace',
    relativePath = '',
} = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    const basePath = pickZoneRoot(paths, zone);
    const { normalized, targetPath } = ensureSafeResolvedPath(basePath, relativePath);

    if (!normalized) {
        throw new Error('缺少文件路径。');
    }

    const content = await fs.readFile(targetPath, 'utf8');

    return {
        threadKey,
        zone,
        relativePath: normalized,
        fileName: path.basename(normalized),
        filePath: targetPath,
        mimeType: inferMimeType(normalized),
        content,
        excerpt: content.length > MAX_READ_CHARS ? `${content.slice(0, MAX_READ_CHARS)}\n...（以下内容已截断）` : content,
        href: buildWorkspaceHref({
            threadKey,
            zone,
            relativePath: normalized,
        }),
    };
}

export async function writeFireflyThreadWorkspaceFile({
    threadKey = 'default',
    zone = 'workspace',
    relativePath = '',
    content = '',
} = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    const basePath = pickZoneRoot(paths, zone);
    const fallbackName = `note-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    const nextRelativePath = normalizeRelativePath(relativePath) || fallbackName;
    const { normalized, targetPath } = ensureSafeResolvedPath(basePath, nextRelativePath);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, String(content || ''), 'utf8');
    const stats = await fs.stat(targetPath);

    return {
        threadKey,
        zone,
        relativePath: normalized,
        fileName: path.basename(normalized),
        filePath: targetPath,
        mimeType: inferMimeType(normalized),
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        href: buildWorkspaceHref({
            threadKey,
            zone,
            relativePath: normalized,
        }),
    };
}

export async function publishFireflyWorkspaceFile({
    threadKey = 'default',
    relativePath = '',
    outputFileName = '',
} = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    const { normalized, targetPath } = ensureSafeResolvedPath(paths.workspacePath, relativePath);

    if (!normalized) {
        throw new Error('缺少待发布文件路径。');
    }

    const sourceStats = await statIfExists(targetPath);
    if (!sourceStats || !sourceStats.isFile()) {
        throw new Error('待发布的 workspace 文件不存在。');
    }

    const nextOutputName = normalizeRelativePath(outputFileName) || path.basename(normalized);
    const { normalized: outputRelativePath, targetPath: outputPath } = ensureSafeResolvedPath(paths.outputsPath, nextOutputName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(targetPath, outputPath);
    const outputStats = await fs.stat(outputPath);

    return {
        threadKey,
        sourceRelativePath: normalized,
        outputRelativePath,
        fileName: path.basename(outputRelativePath),
        filePath: outputPath,
        mimeType: inferMimeType(outputRelativePath),
        size: outputStats.size,
        updatedAt: outputStats.mtime.toISOString(),
        href: buildWorkspaceHref({
            threadKey,
            zone: 'outputs',
            relativePath: outputRelativePath,
        }),
    };
}

export async function buildFireflyThreadWorkspaceManifest(threadKey = 'default') {
    const paths = buildFireflyThreadPaths(threadKey);
    const [workspaceFiles, outputFiles] = await Promise.all([
        buildManifestEntries(paths.workspacePath, 'workspace'),
        buildManifestEntries(paths.outputsPath, 'outputs'),
    ]);

    const manifest = {
        threadKey,
        generatedAt: new Date().toISOString(),
        workspacePath: paths.workspacePath,
        outputsPath: paths.outputsPath,
        counts: {
            workspaceFiles: workspaceFiles.length,
            outputFiles: outputFiles.length,
        },
        files: [
            ...workspaceFiles,
            ...outputFiles,
        ],
    };

    const saved = await writeFireflyThreadWorkspaceFile({
        threadKey,
        zone: 'outputs',
        relativePath: 'manifest.json',
        content: JSON.stringify(manifest, null, 2),
    });

    return {
        manifest,
        saved,
    };
}
