import { NextResponse } from 'next/server';
import {
    getFireflyMemoryEntryById,
    listFireflyMemoryEntries,
    queryFireflyMemoryEntries,
    rememberFireflyServerTask,
    removeFireflyMemoryEntries,
    summarizeFireflyMemoryEntries,
    upsertFireflyMemoryEntry,
} from '@/lib/fireflyMemoryStore';
import {
    appendFireflyGovernanceEvent,
    getDefaultFireflyControlPlanePrefs,
    getFireflyClientState,
    patchFireflyClientState,
} from '@/lib/fireflyClientStateStore';
import {
    buildFireflyToolbeltSnapshot,
    setFireflyToolLeased,
    setFireflyToolPinned,
} from '@/lib/fireflyToolbeltStore';
import {
    getFireflyRuntimeThread,
    listFireflyRuntimeState,
} from '@/lib/fireflyRuntimeStore';
import { listFireflyTools } from '@/services/fireflyToolRegistry';

function normalizeArray(value) {
    if (Array.isArray(value)) {
        return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function matchesScope(record = {}, { uid = '', fid = '', threadKey = '' } = {}) {
    if (uid && record.uid && record.uid !== uid) {
        return false;
    }
    if (fid && record.fid && record.fid !== fid) {
        return false;
    }
    if (threadKey && record.threadKey && record.threadKey !== threadKey && !record.crossThreadPinned) {
        return false;
    }
    return true;
}

function parseScope(source = {}) {
    return {
        uid: String(source.uid || '').trim(),
        fid: String(source.fid || '').trim(),
        threadKey: String(source.threadKey || '').trim(),
        capabilityIds: normalizeArray(source.capabilityIds),
    };
}

function normalizeBlockedToolIds(toolIds = []) {
    return Array.isArray(toolIds)
        ? toolIds.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeConfirmBeforeUseToolIds(toolIds = []) {
    return Array.isArray(toolIds)
        ? toolIds.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function resolvePriorityImportance(priorityBand = '', fallback = 3) {
    if (priorityBand === 'critical') return 5;
    if (priorityBand === 'high') return 4;
    if (priorityBand === 'working') return 2;
    return Math.max(1, Math.min(5, Number(fallback || 3)));
}

function buildMergedControlPlanePrefs(currentPrefs = {}, patchPrefs = {}) {
    const defaults = getDefaultFireflyControlPlanePrefs();
    const hasPresetOverride = typeof patchPrefs?.presetId === 'string' && String(patchPrefs.presetId || '').trim();
    const shouldMarkCustom = !hasPresetOverride && (
        patchPrefs?.memory !== undefined
        || patchPrefs?.tools !== undefined
    );
    const nextBlockedToolIds = patchPrefs?.tools?.blockedToolIds !== undefined
        ? normalizeBlockedToolIds(patchPrefs.tools.blockedToolIds)
        : normalizeBlockedToolIds(currentPrefs?.tools?.blockedToolIds || defaults.tools.blockedToolIds);
    const nextConfirmBeforeUseToolIds = patchPrefs?.tools?.confirmBeforeUseToolIds !== undefined
        ? normalizeConfirmBeforeUseToolIds(patchPrefs.tools.confirmBeforeUseToolIds)
        : normalizeConfirmBeforeUseToolIds(currentPrefs?.tools?.confirmBeforeUseToolIds || defaults.tools.confirmBeforeUseToolIds);

    return {
        presetId: hasPresetOverride
            ? String(patchPrefs.presetId || '').trim()
            : (shouldMarkCustom ? 'custom' : String(currentPrefs?.presetId || defaults.presetId || 'balanced').trim()),
        memory: {
            injectTopK: Number(
                patchPrefs?.memory?.injectTopK
                ?? currentPrefs?.memory?.injectTopK
                ?? defaults.memory.injectTopK
            ),
            autoRememberTasks: patchPrefs?.memory?.autoRememberTasks !== undefined
                ? Boolean(patchPrefs.memory.autoRememberTasks)
                : (currentPrefs?.memory?.autoRememberTasks !== false),
            defaultPriorityBand: String(
                patchPrefs?.memory?.defaultPriorityBand
                || currentPrefs?.memory?.defaultPriorityBand
                || defaults.memory.defaultPriorityBand
            ).trim(),
        },
        tools: {
            selectionMode: String(
                patchPrefs?.tools?.selectionMode
                || currentPrefs?.tools?.selectionMode
                || defaults.tools.selectionMode
            ).trim(),
            webSearchMode: String(
                patchPrefs?.tools?.webSearchMode
                || currentPrefs?.tools?.webSearchMode
                || defaults.tools.webSearchMode
            ).trim(),
            blockedToolIds: nextBlockedToolIds,
            confirmBeforeUseToolIds: nextConfirmBeforeUseToolIds,
        },
    };
}

function parseScopeFromSearchParams(searchParams) {
    return parseScope({
        uid: searchParams.get('uid') || '',
        fid: searchParams.get('fid') || '',
        threadKey: searchParams.get('threadKey') || '',
        capabilityIds: searchParams.getAll('capabilityIds').length > 0
            ? searchParams.getAll('capabilityIds')
            : (searchParams.get('capabilityIds') || ''),
    });
}

function rankMemoryTypes(entries = []) {
    return Object.entries(
        entries.reduce((acc, item) => {
            const key = String(item.memoryType || 'task_result').trim();
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {})
    )
        .map(([id, count]) => ({ id, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 4);
}

function simplifyTask(task = null) {
    if (!task || typeof task !== 'object') {
        return null;
    }

    return {
        id: task.id || '',
        threadKey: task.threadKey || '',
        title: task.title || '未命名任务',
        status: task.status || 'planning',
        resultSummary: task.resultSummary || '',
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
        selectedSkillLabels: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels : [],
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
    };
}

function buildToolCatalog() {
    return listFireflyTools().map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        sourceKind: tool.sourceKind,
        capabilityId: tool.capabilityId,
        surfaces: Array.isArray(tool.surfaces) ? tool.surfaces : [],
        sourceRefs: tool.sourceRefs || {},
    }));
}

function buildGovernanceLabel(action = '', body = {}) {
    const toolId = String(body.toolId || '').trim();
    if (action === 'tool_pin') return `固定工具 ${toolId}`;
    if (action === 'tool_unpin') return `取消固定 ${toolId}`;
    if (action === 'tool_lease') return `临时启用 ${toolId}`;
    if (action === 'tool_revoke') return `撤销临时启用 ${toolId}`;
    if (action === 'tool_block') return `屏蔽工具 ${toolId}`;
    if (action === 'tool_unblock') return `恢复工具 ${toolId}`;
    if (action === 'tool_require_confirm') return `工具改为使用前确认 ${toolId}`;
    if (action === 'tool_skip_confirm') return `取消工具确认 ${toolId}`;
    if (action === 'memory_remember_task') return '记住当前任务';
    if (action === 'memory_summarize') return '压缩线程记忆';
    if (action === 'settings_update') return '更新前台治理策略';
    return action || '前台治理动作';
}

function buildGovernanceDetail(action = '', message = '', body = {}) {
    const toolId = String(body.toolId || '').trim();
    if (message) {
        return message;
    }
    if (action === 'settings_update') {
        const selectionMode = String(body?.controlPlanePrefs?.tools?.selectionMode || '').trim();
        const webSearchMode = String(body?.controlPlanePrefs?.tools?.webSearchMode || '').trim();
        const injectTopK = body?.controlPlanePrefs?.memory?.injectTopK;
        return [
            selectionMode ? `工具策略：${selectionMode}` : '',
            webSearchMode ? `联网策略：${webSearchMode}` : '',
            injectTopK !== undefined ? `记忆注入：${injectTopK}` : '',
        ].filter(Boolean).join(' · ');
    }
    return toolId ? `目标工具：${toolId}` : '';
}

function buildMemoryCreatePayloadFromEntry(entry = {}) {
    return {
        memoryId: String(entry.id || '').trim(),
        taskId: String(entry.taskId || '').trim(),
        sessionId: String(entry.sessionId || '').trim(),
        title: String(entry.title || '').trim(),
        summary: String(entry.summary || '').trim(),
        detail: String(entry.detail || '').trim(),
        memoryType: String(entry.memoryType || 'user_preference').trim(),
        retentionPolicy: String(entry.retentionPolicy || 'rolling').trim(),
        visibility: String(entry.visibility || 'runtime').trim(),
        priorityBand: String(entry.priorityBand || 'standard').trim(),
        note: String(entry.note || '').trim(),
        crossThreadPinned: Boolean(entry.crossThreadPinned),
        frozen: Boolean(entry.frozen),
        tags: Array.isArray(entry.tags) ? entry.tags : [],
    };
}

function buildMemoryUpdatePayloadFromEntry(entry = {}) {
    return {
        memoryId: String(entry.id || '').trim(),
        priorityBand: String(entry.priorityBand || 'standard').trim(),
        retentionPolicy: String(entry.retentionPolicy || 'rolling').trim(),
        visibility: String(entry.visibility || 'runtime').trim(),
        note: String(entry.note || '').trim(),
        frozen: Boolean(entry.frozen),
        crossThreadPinned: Boolean(entry.crossThreadPinned),
    };
}

function buildGovernanceReplayInstruction(event = {}) {
    const action = String(event.action || '').trim();
    const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};

    if (!action) {
        return null;
    }

    if (action === 'settings_update' && metadata.controlPlanePrefs) {
        return {
            label: '再次应用',
            action: 'settings_update',
            payload: {
                controlPlanePrefs: metadata.controlPlanePrefs,
            },
        };
    }

    if (['tool_pin', 'tool_unpin', 'tool_lease', 'tool_revoke', 'tool_block', 'tool_unblock', 'tool_require_confirm', 'tool_skip_confirm'].includes(action)) {
        return {
            label: '再次应用',
            action,
            payload: {
                toolId: String(metadata.toolId || '').trim(),
                label: String(metadata.toolLabel || '').trim(),
                leaseReason: String(metadata.leaseReason || '').trim(),
            },
        };
    }

    if (action === 'memory_update' && metadata.nextState) {
        return {
            label: '再次应用',
            action: 'memory_update',
            payload: {
                memoryId: String(metadata.memoryId || '').trim(),
                ...metadata.nextState,
            },
        };
    }

    if (action === 'memory_create' && metadata.createdEntry) {
        return {
            label: '再次应用',
            action: 'memory_create',
            payload: metadata.createdEntry,
        };
    }

    if (action === 'memory_summarize') {
        return {
            label: '再次应用',
            action: 'memory_summarize',
            payload: {
                title: String(metadata.title || '').trim(),
                limit: Number(metadata.limit || 6),
            },
        };
    }

    if (action === 'memory_remember_task' && event.taskId) {
        return {
            label: '再次应用',
            action: 'memory_remember_task',
            payload: {
                taskId: String(event.taskId || '').trim(),
                defaultPriorityBand: String(metadata.defaultPriorityBand || '').trim(),
            },
        };
    }

    return null;
}

function buildGovernanceRollbackInstruction(event = {}) {
    const action = String(event.action || '').trim();
    const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};

    if (!action) {
        return null;
    }

    if (action === 'tool_pin') {
        return {
            label: '回滚',
            action: 'tool_unpin',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
                label: String(metadata.toolLabel || '').trim(),
            },
        };
    }

    if (action === 'tool_unpin') {
        return {
            label: '回滚',
            action: 'tool_pin',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
                label: String(metadata.toolLabel || '').trim(),
            },
        };
    }

    if (action === 'tool_lease') {
        return {
            label: '回滚',
            action: 'tool_revoke',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
                label: String(metadata.toolLabel || '').trim(),
            },
        };
    }

    if (action === 'tool_revoke') {
        return {
            label: '回滚',
            action: 'tool_lease',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
                label: String(metadata.toolLabel || '').trim(),
                leaseReason: String(metadata.leaseReason || '').trim(),
            },
        };
    }

    if (action === 'tool_block') {
        return {
            label: '回滚',
            action: 'tool_unblock',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
            },
        };
    }

    if (action === 'tool_unblock') {
        return {
            label: '回滚',
            action: 'tool_block',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
            },
        };
    }

    if (action === 'tool_require_confirm') {
        return {
            label: '回滚',
            action: 'tool_skip_confirm',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
            },
        };
    }

    if (action === 'tool_skip_confirm') {
        return {
            label: '回滚',
            action: 'tool_require_confirm',
            payload: {
                toolId: String(metadata.toolId || '').trim(),
            },
        };
    }

    if (action === 'settings_update' && metadata.previousControlPlanePrefs) {
        return {
            label: '回滚',
            action: 'settings_update',
            payload: {
                controlPlanePrefs: metadata.previousControlPlanePrefs,
            },
        };
    }

    if (action === 'memory_update' && metadata.previousState) {
        return {
            label: '回滚',
            action: 'memory_update',
            payload: {
                memoryId: String(metadata.memoryId || '').trim(),
                ...metadata.previousState,
            },
        };
    }

    if ((action === 'memory_create' || action === 'memory_remember_task' || action === 'memory_summarize') && metadata.memoryId) {
        return {
            label: '回滚',
            action: 'memory_delete',
            payload: {
                memoryId: String(metadata.memoryId || '').trim(),
            },
        };
    }

    if (action === 'memory_delete' && Array.isArray(metadata.removedEntries) && metadata.removedEntries.length === 1) {
        return {
            label: '回滚',
            action: 'memory_create',
            payload: metadata.removedEntries[0],
        };
    }

    return null;
}

function enrichGovernanceEvent(event = {}) {
    const replay = buildGovernanceReplayInstruction(event);
    const rollback = buildGovernanceRollbackInstruction(event);
    return {
        ...event,
        availableActions: {
            replay,
            rollback,
        },
    };
}

async function resolveScopedTask({ taskId = '', threadKey = '' } = {}) {
    const normalizedTaskId = String(taskId || '').trim();
    if (normalizedTaskId) {
        const runtime = await listFireflyRuntimeState();
        return (runtime.tasks || []).find((item) => item.id === normalizedTaskId) || null;
    }

    if (!threadKey) {
        return null;
    }

    const thread = await getFireflyRuntimeThread(threadKey);
    return thread?.activeTask || null;
}

async function buildControlPlanePayload(scope = {}) {
    const scopedEntries = (await listFireflyMemoryEntries()).filter((entry) => matchesScope(entry, scope));
    const memoryEntries = await queryFireflyMemoryEntries({
        uid: scope.uid,
        fid: scope.fid,
        threadKey: scope.threadKey,
        capabilityIds: scope.capabilityIds,
        question: '',
        limit: 10,
    });
    const toolbelt = await buildFireflyToolbeltSnapshot({
        uid: scope.uid,
        fid: scope.fid,
        threadKey: scope.threadKey,
    });
    const thread = scope.threadKey ? await getFireflyRuntimeThread(scope.threadKey) : null;
    const clientState = await getFireflyClientState({
        uid: scope.uid,
        fid: scope.fid,
    });
    const governanceEvents = Array.isArray(clientState.governanceEvents)
        ? clientState.governanceEvents
            .filter((item) => {
                if (!scope.threadKey) {
                    return true;
                }
                return !item.threadKey || item.threadKey === scope.threadKey;
            })
            .map(enrichGovernanceEvent)
            .slice(0, 8)
        : [];

    return {
        ok: true,
        scope,
        activeTask: simplifyTask(thread?.activeTask || null),
        controlPlanePrefs: clientState.controlPlanePrefs || getDefaultFireflyControlPlanePrefs(),
        governanceEvents,
        memory: {
            entries: memoryEntries,
            metrics: {
                total: scopedEntries.length,
                compressed: scopedEntries.filter((entry) => entry.memoryLayer === 'compressed').length,
                raw: scopedEntries.filter((entry) => entry.memoryLayer !== 'compressed').length,
                types: rankMemoryTypes(scopedEntries),
            },
        },
        toolbelt,
        toolCatalog: buildToolCatalog(),
    };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const scope = parseScopeFromSearchParams(searchParams);
        return NextResponse.json(await buildControlPlanePayload(scope));
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to load Firefly control plane.',
        }, { status: 500 });
    }
}

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const scope = parseScope(body);

    if (!action) {
        return NextResponse.json({
            ok: false,
            error: 'Missing action.',
        }, { status: 400 });
    }

    try {
        let message = '';
        let governanceEvent = null;

        if (action === 'memory_summarize') {
            const summarized = await summarizeFireflyMemoryEntries({
                uid: scope.uid,
                fid: scope.fid,
                threadKey: scope.threadKey,
                title: String(body.title || '前台记忆压缩摘要').trim(),
                capabilityIds: scope.capabilityIds,
                question: String(body.question || '').trim(),
                limit: Number(body.limit || 6),
            });
            message = summarized
                ? `已压缩记忆：${summarized.title}`
                : '当前范围内还没有足够记忆可压缩。';
            governanceEvent = {
                kind: 'memory',
                label: buildGovernanceLabel(action, body),
                detail: buildGovernanceDetail(action, message, body),
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                metadata: {
                    title: String(body.title || '').trim(),
                    limit: Number(body.limit || 6),
                    memoryId: summarized?.id || '',
                },
            };
        } else if (action === 'memory_remember_task') {
            const task = await resolveScopedTask({
                taskId: String(body.taskId || '').trim(),
                threadKey: scope.threadKey,
            });

            if (!task) {
                return NextResponse.json({
                    ok: false,
                    error: '当前没有可记住的任务。',
                }, { status: 404 });
            }

            const saved = await rememberFireflyServerTask(task, {
                uid: scope.uid,
                fid: scope.fid,
                sessionId: task.sessionId || '',
                defaultPriorityBand: String(body.defaultPriorityBand || '').trim(),
            });
            message = saved
                ? `已记住任务：${saved.title}`
                : '当前任务未写入记忆，可能是记忆策略已关闭。';
            governanceEvent = {
                kind: 'memory',
                label: buildGovernanceLabel(action, body),
                detail: buildGovernanceDetail(action, message, body),
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                taskId: task.id,
                metadata: {
                    taskTitle: task.title,
                    taskId: task.id,
                    defaultPriorityBand: String(body.defaultPriorityBand || '').trim(),
                    memoryId: saved?.id || '',
                },
            };
        } else if (action === 'memory_update') {
            const memoryId = String(body.memoryId || '').trim();
            const current = await getFireflyMemoryEntryById(memoryId);
            if (!current || !matchesScope(current, scope)) {
                return NextResponse.json({
                    ok: false,
                    error: '没有找到可更新的记忆项。',
                }, { status: 404 });
            }

            const priorityBand = String(body.priorityBand || current.priorityBand || 'standard').trim();
            const retentionPolicy = String(body.retentionPolicy || current.retentionPolicy || 'rolling').trim();
            const visibility = String(body.visibility || current.visibility || 'runtime').trim();
            const note = body.note !== undefined ? String(body.note || '').trim() : current.note || '';
            const frozen = body.frozen !== undefined ? Boolean(body.frozen) : Boolean(current.frozen);
            const crossThreadPinned = body.crossThreadPinned !== undefined
                ? Boolean(body.crossThreadPinned)
                : Boolean(current.crossThreadPinned);
            const previousState = buildMemoryUpdatePayloadFromEntry(current);
            const nextState = {
                priorityBand,
                retentionPolicy,
                visibility,
                note,
                frozen,
                crossThreadPinned,
            };
            await upsertFireflyMemoryEntry({
                ...current,
                priorityBand,
                retentionPolicy,
                visibility,
                note,
                frozen,
                crossThreadPinned,
                importance: resolvePriorityImportance(priorityBand, current.importance),
            });
            message = `已更新记忆治理：${current.title}`;
            governanceEvent = {
                kind: 'memory',
                label: `更新记忆 ${current.title}`,
                detail: buildGovernanceDetail(action, message, body),
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                metadata: {
                    memoryId,
                    previousState,
                    nextState,
                },
            };
        } else if (action === 'memory_create') {
            const title = String(body.title || '').trim();
            const summary = String(body.summary || '').trim();
            const detail = String(body.detail || '').trim();
            if (!title || !summary) {
                return NextResponse.json({
                    ok: false,
                    error: '手动记忆至少需要标题和摘要。',
                }, { status: 400 });
            }

            const priorityBand = String(body.priorityBand || 'standard').trim();
            const memoryType = String(body.memoryType || 'user_preference').trim();
            const retentionPolicy = String(body.retentionPolicy || 'rolling').trim();
            const visibility = String(body.visibility || 'runtime').trim();
            const note = String(body.note || '').trim();
            const created = await upsertFireflyMemoryEntry({
                uid: scope.uid,
                fid: scope.fid,
                taskId: String(body.taskId || '').trim(),
                sessionId: String(body.sessionId || '').trim(),
                threadKey: scope.threadKey,
                title,
                summary,
                detail,
                capabilityIds: scope.capabilityIds,
                tags: normalizeArray(body.tags),
                source: 'firefly_frontstage_memory',
                memoryType,
                memoryLayer: 'raw',
                anchorType: scope.threadKey ? 'thread' : 'user',
                visibility,
                retentionPolicy,
                priorityBand,
                importance: resolvePriorityImportance(priorityBand, 3),
                note,
                frozen: Boolean(body.frozen),
                crossThreadPinned: Boolean(body.crossThreadPinned),
            });
            message = `已写入手动记忆：${created.title}`;
            governanceEvent = {
                kind: 'memory',
                label: '前台写入记忆',
                detail: `${created.title} · ${created.summary}`,
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                taskId: String(body.taskId || '').trim(),
                metadata: {
                    memoryId: created.id,
                    createdEntry: buildMemoryCreatePayloadFromEntry(created),
                    memoryType,
                    priorityBand,
                    retentionPolicy,
                    visibility,
                },
            };
        } else if (action === 'memory_delete') {
            const targetIds = normalizeArray(body.memoryIds).concat(normalizeArray(body.memoryId));
            const scopedEntries = (await listFireflyMemoryEntries()).filter((entry) => matchesScope(entry, scope));
            const allowedIds = scopedEntries
                .filter((entry) => targetIds.includes(entry.id))
                .map((entry) => entry.id);

            if (!allowedIds.length) {
                return NextResponse.json({
                    ok: false,
                    error: '没有找到可删除的记忆项。',
                }, { status: 404 });
            }

            const removed = await removeFireflyMemoryEntries(allowedIds);
            message = removed.length > 0 ? `已移除 ${removed.length} 条记忆。` : '没有匹配的记忆被移除。';
            governanceEvent = {
                kind: 'memory',
                label: '删除记忆',
                detail: message,
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                metadata: {
                    removedCount: removed.length,
                    removedEntries: removed.map((entry) => buildMemoryCreatePayloadFromEntry(entry)),
                },
            };
        } else if (['tool_pin', 'tool_unpin', 'tool_lease', 'tool_revoke'].includes(action)) {
            const toolId = String(body.toolId || '').trim();
            if (!toolId) {
                return NextResponse.json({
                    ok: false,
                    error: 'Missing toolId.',
                }, { status: 400 });
            }

            const toolLabel = String(
                body.label
                || buildToolCatalog().find((item) => item.id === toolId)?.name
                || toolId
            ).trim();

            if (action === 'tool_pin' || action === 'tool_unpin') {
                await setFireflyToolPinned({
                    uid: scope.uid,
                    fid: scope.fid,
                    threadKey: scope.threadKey,
                    toolId,
                    label: toolLabel,
                    pinned: action === 'tool_pin',
                });
                message = action === 'tool_pin'
                    ? `已固定工具：${toolLabel}`
                    : `已取消固定：${toolLabel}`;
            } else {
                await setFireflyToolLeased({
                    uid: scope.uid,
                    fid: scope.fid,
                    threadKey: scope.threadKey,
                    toolId,
                    label: toolLabel,
                    leased: action === 'tool_lease',
                    leaseReason: action === 'tool_lease'
                        ? String(body.leaseReason || 'frontstage_control_plane').trim()
                        : '',
                });
                message = action === 'tool_lease'
                    ? `已临时启用：${toolLabel}`
                    : `已撤销临时启用：${toolLabel}`;
            }
            governanceEvent = {
                kind: 'tool',
                label: buildGovernanceLabel(action, body),
                detail: message,
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                metadata: {
                    toolId,
                    toolLabel,
                    leaseReason: action === 'tool_lease'
                        ? String(body.leaseReason || 'frontstage_control_plane').trim()
                        : '',
                },
            };
        } else if (action === 'tool_block' || action === 'tool_unblock' || action === 'tool_require_confirm' || action === 'tool_skip_confirm' || action === 'settings_update') {
            const clientState = await getFireflyClientState({
                uid: scope.uid,
                fid: scope.fid,
            });
            const currentPrefs = clientState.controlPlanePrefs || getDefaultFireflyControlPlanePrefs();
            const previousControlPlanePrefs = currentPrefs;
            let patchPrefs = {
                ...(body.controlPlanePrefs && typeof body.controlPlanePrefs === 'object' ? body.controlPlanePrefs : {}),
            };

            if (action === 'tool_block' || action === 'tool_unblock' || action === 'tool_require_confirm' || action === 'tool_skip_confirm') {
                const toolId = String(body.toolId || '').trim();
                if (!toolId) {
                    return NextResponse.json({
                        ok: false,
                        error: 'Missing toolId.',
                    }, { status: 400 });
                }

                if (action === 'tool_block' || action === 'tool_unblock') {
                    const blockedSet = new Set(normalizeBlockedToolIds(currentPrefs?.tools?.blockedToolIds));
                    if (action === 'tool_block') {
                        blockedSet.add(toolId);
                        message = `已屏蔽工具：${toolId}`;
                    } else {
                        blockedSet.delete(toolId);
                        message = `已恢复工具：${toolId}`;
                    }

                    patchPrefs = {
                        ...patchPrefs,
                        tools: {
                            ...(patchPrefs.tools || {}),
                            blockedToolIds: Array.from(blockedSet),
                        },
                    };
                } else {
                    const confirmSet = new Set(normalizeConfirmBeforeUseToolIds(currentPrefs?.tools?.confirmBeforeUseToolIds));
                    if (action === 'tool_require_confirm') {
                        confirmSet.add(toolId);
                        message = `已设为使用前确认：${toolId}`;
                    } else {
                        confirmSet.delete(toolId);
                        message = `已取消使用前确认：${toolId}`;
                    }

                    patchPrefs = {
                        ...patchPrefs,
                        tools: {
                            ...(patchPrefs.tools || {}),
                            confirmBeforeUseToolIds: Array.from(confirmSet),
                        },
                    };
                }
            } else {
                message = '已更新 control plane 策略。';
            }

            await patchFireflyClientState({
                uid: scope.uid,
                fid: scope.fid,
                controlPlanePrefs: buildMergedControlPlanePrefs(currentPrefs, patchPrefs),
            });
            const nextControlPlanePrefs = buildMergedControlPlanePrefs(currentPrefs, patchPrefs);
            governanceEvent = {
                kind: action === 'settings_update' ? 'policy' : 'tool',
                label: buildGovernanceLabel(action, body),
                detail: buildGovernanceDetail(action, message, body),
                scope: scope.threadKey ? 'thread' : 'user',
                action,
                threadKey: scope.threadKey,
                metadata: {
                    toolId: String(body.toolId || '').trim(),
                    controlPlanePrefs: nextControlPlanePrefs,
                    previousControlPlanePrefs,
                },
            };
        } else if (action === 'governance_replay' || action === 'governance_rollback') {
            const instruction = body.instruction && typeof body.instruction === 'object' ? body.instruction : null;
            if (!instruction?.action) {
                return NextResponse.json({
                    ok: false,
                    error: '缺少可执行的治理指令。',
                }, { status: 400 });
            }

            const replayBody = {
                ...body,
                action: instruction.action,
                ...(instruction.payload && typeof instruction.payload === 'object' ? instruction.payload : {}),
            };

            return POST(new Request(request.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(replayBody),
            }));
        } else {
            return NextResponse.json({
                ok: false,
                error: 'Unsupported action.',
            }, { status: 400 });
        }

        if (governanceEvent) {
            await appendFireflyGovernanceEvent({
                uid: scope.uid,
                fid: scope.fid,
                event: governanceEvent,
            });
        }

        return NextResponse.json({
            ...(await buildControlPlanePayload(scope)),
            action,
            message,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to update Firefly control plane.',
        }, { status: 500 });
    }
}
