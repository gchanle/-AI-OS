function buildDefaultControlPlanePrefs() {
    return {
        presetId: 'balanced',
        memory: {
            injectTopK: 4,
            autoRememberTasks: true,
            defaultPriorityBand: 'standard',
        },
        tools: {
            selectionMode: 'auto',
            webSearchMode: 'auto',
            blockedToolIds: [],
            confirmBeforeUseToolIds: [],
        },
    };
}

export function formatFireflySelectionModeLabel(mode = '') {
    if (mode === 'pinned_only') return '仅固定工具';
    if (mode === 'prefer_pinned') return '优先固定工具';
    return '自动';
}

export function formatFireflyWebSearchModeLabel(mode = '') {
    if (mode === 'manual_only') return '仅手动开启后允许';
    return '自动判断';
}

function buildSafePrefs(prefs = null) {
    const fallback = buildDefaultControlPlanePrefs();
    if (!prefs || typeof prefs !== 'object') {
        return fallback;
    }

    return {
        ...fallback,
        ...prefs,
        memory: {
            ...fallback.memory,
            ...(prefs.memory && typeof prefs.memory === 'object' ? prefs.memory : {}),
        },
        tools: {
            ...fallback.tools,
            ...(prefs.tools && typeof prefs.tools === 'object' ? prefs.tools : {}),
        },
    };
}

function isPriorityMemory(item = {}) {
    return Boolean(
        item?.crossThreadPinned
        || item?.frozen
        || item?.priorityBand === 'critical'
        || item?.priorityBand === 'high'
    );
}

function buildDisplayToolLabels(displayTools = []) {
    return (Array.isArray(displayTools) ? displayTools : [])
        .slice(0, 4)
        .map((item) => item?.name || item?.id)
        .filter(Boolean);
}

function buildPriorityMemoryTitles(memoryEntries = [], injectTopK = 4) {
    return (Array.isArray(memoryEntries) ? memoryEntries : [])
        .filter((item) => isPriorityMemory(item))
        .slice(0, Math.max(1, Number(injectTopK || 4)))
        .map((item) => item.title)
        .filter(Boolean);
}

function buildToolMap(task = null, candidateTools = []) {
    const map = new Map();

    (Array.isArray(candidateTools) ? candidateTools : []).forEach((tool) => {
        if (tool?.id) {
            map.set(tool.id, tool);
        }
    });

    (Array.isArray(task?.selectedSkills) ? task.selectedSkills : []).forEach((tool) => {
        if (tool?.id && !map.has(tool.id)) {
            map.set(tool.id, tool);
        }
    });

    const toolSelectionControl = task?.planMetadata?.toolSelectionControl && typeof task.planMetadata.toolSelectionControl === 'object'
        ? task.planMetadata.toolSelectionControl
        : null;

    (Array.isArray(toolSelectionControl?.selectedTools) ? toolSelectionControl.selectedTools : []).forEach((tool) => {
        if (tool?.id && !map.has(tool.id)) {
            map.set(tool.id, tool);
        }
    });

    (Array.isArray(toolSelectionControl?.excludedTools) ? toolSelectionControl.excludedTools : []).forEach((tool) => {
        if (tool?.id && !map.has(tool.id)) {
            map.set(tool.id, tool);
        }
    });

    return map;
}

function buildToolbeltStateMap(toolbeltItems = []) {
    return new Map(
        (Array.isArray(toolbeltItems) ? toolbeltItems : [])
            .filter((item) => item?.toolId)
            .map((item) => [item.toolId, item])
    );
}

function formatStepLabel(step = {}, toolMap = new Map()) {
    const toolId = String(step?.toolId || step?.skillId || '').trim();
    return String(
        step?.label
        || step?.subtaskLabel
        || step?.workerLabel
        || toolMap.get(toolId)?.name
        || toolId
        || '未命名步骤'
    ).trim();
}

function isExternalResearchTool(toolId = '') {
    return /^(web|research)\./.test(String(toolId || '').trim());
}

function isReadLikeTool(toolId = '') {
    return ['web.fetch', 'research.read'].includes(String(toolId || '').trim());
}

function isSearchLikeTool(toolId = '') {
    return ['web.search', 'research.search'].includes(String(toolId || '').trim());
}

function isAnswerLikeTool(toolId = '') {
    return ['web.answer', 'research.report'].includes(String(toolId || '').trim());
}

function pushUnique(lines = [], value = '') {
    const normalized = String(value || '').trim();
    if (!normalized || lines.includes(normalized)) {
        return;
    }
    lines.push(normalized);
}

export function buildFireflyExecutionPreview({
    task = null,
    prefs = null,
    memoryEntries = [],
    displayTools = [],
    displayToolMode = 'catalog',
    toolbelt = null,
    blockedToolIds = [],
    confirmBeforeUseToolIds = [],
    takeoverNote = '',
    activeDirective = null,
} = {}) {
    const safePrefs = buildSafePrefs(prefs);
    const memoryList = Array.isArray(memoryEntries) ? memoryEntries : [];
    const toolbeltState = toolbelt && typeof toolbelt === 'object'
        ? toolbelt
        : {
            strategy: {
                pinnedCount: 0,
                leasedCount: 0,
            },
        };
    const displayToolLabels = buildDisplayToolLabels(displayTools);
    const injectedMemories = buildPriorityMemoryTitles(memoryList, safePrefs?.memory?.injectTopK);
    const previewLines = [];

    previewLines.push(`下一轮会按「${formatFireflySelectionModeLabel(safePrefs?.tools?.selectionMode)}」策略选工具。`);

    if (displayToolLabels.length > 0) {
        if (displayToolMode === 'related') {
            previewLines.push(`当前更可能优先复用这些相关工具：${displayToolLabels.join('、')}。`);
        } else if (displayToolMode === 'fallback') {
            previewLines.push(`当前任务还没有稳定工具锚点，会先从线程工具箱里优先考虑：${displayToolLabels.join('、')}。`);
        } else {
            previewLines.push(`当前最可能优先被 planner 看到的工具是：${displayToolLabels.join('、')}。`);
        }
    } else if ((toolbeltState?.strategy?.pinnedCount || 0) > 0 || (toolbeltState?.strategy?.leasedCount || 0) > 0) {
        previewLines.push('当前没有显式高优先工具，但 planner 仍会优先参考你固定或临时启用的工具。');
    } else {
        previewLines.push('当前没有额外工具偏置，planner 会按问题意图自动收敛候选工具。');
    }

    if (injectedMemories.length > 0) {
        previewLines.push(`预计会优先注入这些高权重记忆：${injectedMemories.join('、')}。`);
    } else if (memoryList.length > 0) {
        previewLines.push(`记忆注入上限为 ${Number(safePrefs?.memory?.injectTopK || 4)} 条，但当前没有被明显抬高优先级的记忆。`);
    } else {
        previewLines.push('当前范围内还没有沉淀出长期记忆，下一轮会更依赖当前问题和对话上下文。');
    }

    if (safePrefs?.tools?.webSearchMode === 'manual_only') {
        previewLines.push('未显式开启联网时，不会自动走搜索研究链路。');
    } else {
        previewLines.push('涉及实时信息或公开来源核验时，仍可自动进入联网研究。');
    }

    if (confirmBeforeUseToolIds.length > 0) {
        previewLines.push(`有 ${confirmBeforeUseToolIds.length} 个工具仍要求“使用前确认”，命中后会先暂停等待你批准。`);
    }

    if (blockedToolIds.length > 0) {
        previewLines.push(`有 ${blockedToolIds.length} 个工具已被前台屏蔽，下一轮不会调度它们。`);
    }

    const effectiveTakeoverNote = String(takeoverNote || activeDirective?.note || '').trim();
    if (effectiveTakeoverNote) {
        previewLines.push(`还会带上当前前台指令：${effectiveTakeoverNote}`);
    }

    return {
        title: task?.title ? `下一轮如何继续「${task.title}」` : '下一轮执行预览',
        summary: previewLines[0] || '下一轮会按当前前台策略重新生成 managed context。',
        lines: previewLines,
        chips: [
            `工具 ${formatFireflySelectionModeLabel(safePrefs?.tools?.selectionMode)}`,
            `联网 ${formatFireflyWebSearchModeLabel(safePrefs?.tools?.webSearchMode)}`,
            `记忆注入 ${Number(safePrefs?.memory?.injectTopK || 4)} 条`,
            safePrefs?.memory?.autoRememberTasks === false ? '任务记忆 手动' : '任务记忆 自动',
        ],
    };
}

export function buildFireflyExecutionImpactDiff({
    task = null,
    candidateTools = [],
    blockedToolIds = [],
    confirmBeforeUseToolIds = [],
    visibleToolMode = 'related',
    webSearchMode = '',
} = {}) {
    const toolSelectionControl = task?.planMetadata?.toolSelectionControl && typeof task.planMetadata.toolSelectionControl === 'object'
        ? task.planMetadata.toolSelectionControl
        : null;
    const controlPlanePolicy = task?.planMetadata?.controlPlanePolicy && typeof task.planMetadata.controlPlanePolicy === 'object'
        ? task.planMetadata.controlPlanePolicy
        : null;
    const selectedToolIds = Array.isArray(toolSelectionControl?.selectedToolIds)
        ? toolSelectionControl.selectedToolIds.filter(Boolean)
        : [];
    const blockedSet = new Set(Array.isArray(blockedToolIds) ? blockedToolIds : []);
    const confirmSet = new Set(Array.isArray(confirmBeforeUseToolIds) ? confirmBeforeUseToolIds : []);
    const candidateToolMap = buildToolMap(task, candidateTools);
    const candidateToolIds = new Set(
        Array.from(candidateToolMap.keys()).filter((toolId) => !blockedSet.has(toolId))
    );
    const steps = (Array.isArray(task?.steps) ? task.steps : [])
        .map((step) => {
            const toolId = String(step?.toolId || step?.skillId || '').trim();
            return {
                step,
                toolId,
                label: formatStepLabel(step, candidateToolMap),
            };
        })
        .filter((item) => item.toolId);
    const diffLines = [];

    steps
        .filter(({ toolId }) => blockedSet.has(toolId))
        .slice(0, 2)
        .forEach(({ label, toolId }) => {
            const toolName = candidateToolMap.get(toolId)?.name || toolId;
            pushUnique(diffLines, `如果现在重跑，「${label}」这一步会被跳过，因为「${toolName}」已被前台屏蔽。`);
        });

    steps
        .filter(({ step, toolId }) => confirmSet.has(toolId) && !step?.requiresApproval)
        .slice(0, 2)
        .forEach(({ label }) => {
            pushUnique(diffLines, `如果下一轮还走到「${label}」，这里会新增一次前台确认，批准后才继续。`);
        });

    if (diffLines.length < 4) {
        steps
            .filter(({ step, toolId }) => confirmSet.has(toolId) && step?.requiresApproval)
            .slice(0, 1)
            .forEach(({ label }) => {
                pushUnique(diffLines, `像「${label}」这一步，本来就是当前执行链里的确认点，下一轮仍会先暂停等你批准。`);
            });
    }

    const effectiveWebSearchMode = String(webSearchMode || controlPlanePolicy?.webSearchMode || 'auto').trim();
    const externalSteps = steps.filter(({ toolId }) => isExternalResearchTool(toolId) && !blockedSet.has(toolId));
    const fetchStep = externalSteps.find(({ toolId }) => isReadLikeTool(toolId));
    const searchStep = externalSteps.find(({ toolId }) => isSearchLikeTool(toolId));
    const answerStep = externalSteps.find(({ toolId }) => isAnswerLikeTool(toolId));

    if (effectiveWebSearchMode === 'manual_only' && externalSteps.length > 0) {
        if (fetchStep && answerStep) {
            pushUnique(
                diffLines,
                `只要你没手动开启联网，「${fetchStep.label}」这一步下次可能不会自动进入，最终回答也更可能退回到基于搜索摘要整理。`
            );
        } else if (searchStep) {
            pushUnique(
                diffLines,
                `只要你没手动开启联网，「${searchStep.label}」这段外部研究链下一轮可能不会自动启动。`
            );
        }
    }

    steps
        .filter(({ toolId }) => !candidateToolIds.has(toolId) && !blockedSet.has(toolId))
        .slice(0, 2)
        .forEach(({ label, toolId }) => {
            const toolName = candidateToolMap.get(toolId)?.name || toolId;
            pushUnique(diffLines, `「${label}」对应的「${toolName}」目前已不在下一轮优先候选里，planner 可能会改走别的路径。`);
        });

    if (diffLines.length < 4 && selectedToolIds.length > 0) {
        const fallenOut = selectedToolIds.filter((toolId) => !candidateToolIds.has(toolId) && !blockedSet.has(toolId)).slice(0, 3);
        if (fallenOut.length > 0) {
            pushUnique(diffLines, `上一轮实际命中的 ${fallenOut.join('、')} 现在不再处于优先候选。`);
        }
    }

    if (diffLines.length < 4 && visibleToolMode === 'fallback' && selectedToolIds.length === 0) {
        pushUnique(diffLines, '当前任务还没有稳定工具锚点，下一轮 planner 会更依赖线程工具箱，而不是沿用固定执行链。');
    }

    if (diffLines.length < 4 && blockedSet.size > 0 && steps.every(({ toolId }) => !blockedSet.has(toolId))) {
        pushUnique(diffLines, `当前有 ${blockedSet.size} 个工具被屏蔽，下一轮候选空间会比这一轮更窄。`);
    }

    if (diffLines.length < 4 && confirmSet.size > 0 && !steps.some(({ toolId }) => confirmSet.has(toolId))) {
        pushUnique(diffLines, `当前仍有 ${confirmSet.size} 个工具带“使用前确认”，命中后不会直接一路跑完。`);
    }

    return diffLines.slice(0, 4);
}

export function buildFireflyPlannerExplainers(task = null) {
    const plannerReview = task?.planMetadata?.plannerReview && typeof task.planMetadata.plannerReview === 'object'
        ? task.planMetadata.plannerReview
        : null;
    const sourceBundleReplay = task?.planMetadata?.sourceBundleReplay && typeof task.planMetadata.sourceBundleReplay === 'object'
        ? task.planMetadata.sourceBundleReplay
        : null;
    const explainers = [];

    const selfRevisions = Array.isArray(plannerReview?.selfRevisions)
        ? plannerReview.selfRevisions
        : Array.isArray(plannerReview?.revisions)
            ? plannerReview.revisions
            : [];
    const governanceInfluences = Array.isArray(plannerReview?.governanceInfluences)
        ? plannerReview.governanceInfluences
        : [];

    if (selfRevisions.length) {
        explainers.push({
            id: 'planner-review',
            title: 'Planner 自检修正',
            lines: selfRevisions
                .map((item) => String(item || '').trim())
                .filter(Boolean)
                .slice(0, 3),
        });
    }

    if (governanceInfluences.length) {
        explainers.push({
            id: 'planner-governance-influences',
            title: '前台治理导致的路径变化',
            lines: governanceInfluences
                .map((item) => String(item || '').trim())
                .filter(Boolean)
                .slice(0, 3),
        });
    }

    if (sourceBundleReplay) {
        const sourceCount = Number(sourceBundleReplay.sourceCount || 0);
        const fetchedCount = Number(sourceBundleReplay.fetchedCount || 0);
        const citationCount = Number(sourceBundleReplay.citationCount || 0);
        const sourceLabel = String(sourceBundleReplay.sourceLabel || '').trim();
        const lines = [];

        if (sourceLabel) {
            lines.push(`本轮不是从零重新检索，而是直接复用了「${sourceLabel}」对应的研究材料。`);
        } else {
            lines.push('本轮不是从零重新检索，而是直接复用了已有来源包。');
        }

        lines.push(`当前已带入 ${sourceCount} 条来源、${fetchedCount} 条正文摘录${citationCount > 0 ? `、${citationCount} 条引用绑定` : ''}。`);

        explainers.push({
            id: 'source-bundle-replay',
            title: '来源包复用',
            lines,
        });
    }

    const governanceLabels = Array.isArray(task?.planMetadata?.governanceLabels)
        ? task.planMetadata.governanceLabels.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
        : [];
    if (governanceLabels.length > 0 && governanceInfluences.length === 0) {
        explainers.push({
            id: 'governance-history',
            title: '最近前台治理动作',
            lines: [
                `这轮规划已经显式参考了你刚刚在前台应用的治理动作：${governanceLabels.join('、')}。`,
            ],
        });
    }

    return explainers;
}

export function buildFireflyGovernanceSuggestions({
    task = null,
    prefs = null,
    candidateTools = [],
    toolbeltItems = [],
    blockedToolIds = [],
    confirmBeforeUseToolIds = [],
    visibleToolMode = 'related',
} = {}) {
    const safePrefs = buildSafePrefs(prefs);
    const blockedSet = new Set(Array.isArray(blockedToolIds) ? blockedToolIds : []);
    const confirmSet = new Set(Array.isArray(confirmBeforeUseToolIds) ? confirmBeforeUseToolIds : []);
    const toolMap = buildToolMap(task, candidateTools);
    const toolbeltMap = buildToolbeltStateMap(toolbeltItems);
    const steps = (Array.isArray(task?.steps) ? task.steps : [])
        .map((step) => {
            const toolId = String(step?.toolId || step?.skillId || '').trim();
            return {
                step,
                toolId,
                label: formatStepLabel(step, toolMap),
                toolName: toolMap.get(toolId)?.name || toolId,
            };
        })
        .filter((item) => item.toolId);
    const groups = [];
    const seen = new Set();

    const ensureGroup = (groupId = '', title = '') => {
        let existing = groups.find((item) => item.id === groupId);
        if (existing) {
            return existing;
        }
        existing = {
            id: groupId,
            title,
            items: [],
        };
        groups.push(existing);
        return existing;
    };

    const pushSuggestion = (groupId = '', groupTitle = '', suggestion = null) => {
        if (!groupId || !suggestion?.id || seen.has(suggestion.id)) {
            return;
        }
        seen.add(suggestion.id);
        ensureGroup(groupId, groupTitle).items.push(suggestion);
    };

    const blockedCurrentStep = steps.find(({ toolId }) => blockedSet.has(toolId));
    if (blockedCurrentStep) {
        pushSuggestion('toolchain', '工具链稳定', {
            id: `unblock-${blockedCurrentStep.toolId}`,
            title: `恢复「${blockedCurrentStep.label}」`,
            detail: `当前执行链里本来有这一步，但「${blockedCurrentStep.toolName}」现在被前台屏蔽了。恢复后，下次更容易沿用这条路径。`,
            buttonLabel: '恢复工具',
            action: 'tool_unblock',
            payload: {
                toolId: blockedCurrentStep.toolId,
            },
            tone: 'accent',
        });
    }

    const readStep = steps.find(({ toolId }) => isReadLikeTool(toolId) && !blockedSet.has(toolId) && !confirmSet.has(toolId));
    if (readStep) {
        pushSuggestion('web', '联网治理', {
            id: `confirm-${readStep.toolId}`,
            title: `把「${readStep.label}」改成先确认`,
            detail: `这一步会继续读取外部正文。开启后，命中时会先停在前台，适合你想自己把住联网深度的时候。`,
            buttonLabel: '设为使用前确认',
            action: 'tool_require_confirm',
            payload: {
                toolId: readStep.toolId,
            },
            tone: 'default',
        });
    }

    const externalSteps = steps.filter(({ toolId }) => isExternalResearchTool(toolId) && !blockedSet.has(toolId));
    if (externalSteps.length > 0) {
        if (safePrefs?.tools?.webSearchMode !== 'manual_only') {
            pushSuggestion('web', '联网治理', {
                id: 'switch-web-manual',
                title: '把联网切到手动开启',
                detail: '后续同类问题只有在你显式开启联网时才会继续跑外部研究链，更适合你想在前台手动控节奏的时候。',
                buttonLabel: '切到手动联网',
                action: 'settings_update',
                payload: {
                    controlPlanePrefs: {
                        tools: {
                            webSearchMode: 'manual_only',
                        },
                    },
                },
                tone: 'default',
            });
        } else {
            pushSuggestion('web', '联网治理', {
                id: 'switch-web-auto',
                title: '恢复自动联网判断',
                detail: '后续实时问题或公开资料核验类问题可以自动进入联网研究，不需要你每次手动先打开开关。',
                buttonLabel: '恢复自动联网',
                action: 'settings_update',
                payload: {
                    controlPlanePrefs: {
                        tools: {
                            webSearchMode: 'auto',
                        },
                    },
                },
                tone: 'accent',
            });
        }
    }

    const unpinnedCoreStep = steps.find(({ toolId }) => {
        if (!toolId || blockedSet.has(toolId)) {
            return false;
        }
        return !toolbeltMap.get(toolId)?.pinned;
    });
    if (visibleToolMode === 'related' && unpinnedCoreStep) {
        pushSuggestion('toolchain', '工具链稳定', {
            id: `pin-${unpinnedCoreStep.toolId}`,
            title: `固定「${unpinnedCoreStep.toolName}」到工具箱`,
            detail: '这样 planner 以后在同类问题里会更稳定地优先看到这条核心工具链，不容易每轮都重新漂移。',
            buttonLabel: '固定核心工具',
            action: 'tool_pin',
            payload: {
                toolId: unpinnedCoreStep.toolId,
                label: unpinnedCoreStep.toolName,
            },
            tone: 'accent',
        });
    }

    if (
        safePrefs?.tools?.selectionMode === 'auto'
        && Array.from(toolbeltMap.values()).some((item) => item?.pinned)
    ) {
        pushSuggestion('strategy', '策略稳定', {
            id: 'prefer-pinned-tools',
            title: '让 planner 优先用你固定过的工具',
            detail: '当前你已经固定了一部分工具，但策略仍是完全自动。切到“优先固定工具”后，下一轮路径会更可控。',
            buttonLabel: '优先固定工具',
            action: 'settings_update',
            payload: {
                controlPlanePrefs: {
                    tools: {
                        selectionMode: 'prefer_pinned',
                    },
                },
            },
            tone: 'default',
        });
    }

    if (
        safePrefs?.memory?.injectTopK < 4
        && Array.isArray(task?.memoryIds)
        && task.memoryIds.length > 0
    ) {
        pushSuggestion('memory', '记忆治理', {
            id: 'increase-memory-injection',
            title: '提高记忆注入上限',
            detail: '当前任务已经有可复用记忆，但注入条数偏低。适度调高后，后续续跑会更容易保留上下文连续性。',
            buttonLabel: '记忆注入提到 4 条',
            action: 'settings_update',
            payload: {
                controlPlanePrefs: {
                    memory: {
                        injectTopK: 4,
                    },
                },
            },
            tone: 'default',
        });
    }

    return groups
        .map((group) => ({
            ...group,
            items: group.items.slice(0, 3),
        }))
        .filter((group) => group.items.length > 0)
        .slice(0, 3);
}
