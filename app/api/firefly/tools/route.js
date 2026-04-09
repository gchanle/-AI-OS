import { NextResponse } from 'next/server';
import { listScheduledTaskDefinitions } from '@/lib/scheduledTaskCatalog';
import {
    buildAgentMaturitySnapshot,
    loadAdminAgentRuntimeConfig,
} from '@/lib/adminAgentRuntimeStore';
import { listFireflyTools } from '@/services/fireflyToolRegistry';

export async function GET() {
    const agentConfig = loadAdminAgentRuntimeConfig();
    const tools = listFireflyTools();
    const sourceMix = tools.reduce((acc, tool) => {
        const key = tool.sourceKind || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const scheduledTasks = agentConfig.scheduler.enabled
        ? listScheduledTaskDefinitions().filter((task) => (
            task.id !== 'campus.morning_digest' || agentConfig.scheduler.morningDigestEnabled
        ))
        : [];

    return NextResponse.json({
        ok: true,
        runtime: {
            planner: agentConfig.runtime.enableTaskDecomposition ? 'decomposition_ready' : 'multi_step_ready',
            executor: agentConfig.runtime.allowParallelToolCalls ? 'parallel_streaming_observable' : 'streaming_observable',
            memory: agentConfig.memory.enabled ? 'server_memory_governed' : 'memory_disabled',
            recovery: agentConfig.runtime.checkpointingEnabled ? 'checkpoint_resume_ready' : 'resume_context_ready',
            maturity: 'agent_v0.9',
            config: agentConfig,
            maturityChecklist: buildAgentMaturitySnapshot(agentConfig),
            sourceMix,
            layerGraph: [
                { id: 'connectors', label: '连接器 / 凭证', role: '接入外部系统与认证边界' },
                { id: 'adapters', label: 'Skill / MCP / CLI', role: '能力封装与标准化' },
                { id: 'runtime', label: 'Tool Runtime', role: '计划 / 执行 / 记忆 / 恢复' },
                { id: 'surfaces', label: '萤火虫 / 定时任务 / 工作面', role: '用户触达与后台调度' },
            ],
        },
        tools,
        scheduledTasks,
    });
}
