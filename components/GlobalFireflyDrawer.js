'use client';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import FireflySideDrawer from '@/components/FireflySideDrawer';
import { campusModules } from '@/data/campusPlatform';
import './GlobalFireflyDrawer.css';

const localDrawerPrefixes = ['/library', '/services', '/research', '/assistant', '/agent-builder'];

function resolveModuleTitle(pathname) {
    return campusModules.find((item) => item.href !== '/' && pathname.startsWith(item.href)) || null;
}

function buildGlobalContextMessage(context = {}, question = '') {
    const moduleLabel = context.moduleLabel || '当前页面';
    const pageLabel = context.pageLabel || pathnameToLabel(context.pathname);
    const unreadSummary = context.unreadSummary ? `\n未读消息摘要：\n${context.unreadSummary}` : '';
    const approvalSummary = context.approvalSummary ? `\n审批摘要：\n${context.approvalSummary}` : '';

    return `你正在超星 AI 校园 OS 的「${moduleLabel}」工作面协助用户。\n当前页面：${pageLabel}\n路径：${context.pathname || '/'}${unreadSummary}${approvalSummary}\n\n用户问题：${question}\n\n请优先结合当前页面语境回答；如果需要引用链接，请使用 Markdown 链接格式，不要直接输出长网址。`;
}

function pathnameToLabel(pathname = '/') {
    if (pathname === '/messages') {
        return '消息中心';
    }
    if (pathname.startsWith('/messages/')) {
        return '消息详情';
    }
    if (pathname === '/connectors') {
        return '能力接入中心';
    }
    if (pathname.startsWith('/connectors/catalog')) {
        return '连接器台账';
    }
    if (pathname.startsWith('/connectors/vault')) {
        return '凭证保险库';
    }
    if (pathname.startsWith('/connectors/skills')) {
        return 'Skills 管理';
    }
    if (pathname.startsWith('/connectors/mcp')) {
        return 'MCP 管理';
    }
    if (pathname.startsWith('/connectors/cli')) {
        return 'CLI 管理';
    }
    if (pathname.startsWith('/connectors/')) {
        return '连接器详情';
    }

    return '工作页面';
}

function buildGlobalFallbackReply(context = {}, question = '') {
    const moduleLabel = context.moduleLabel || '当前页面';
    if (/消息|通知|未读/.test(question)) {
        return `我已经结合「${moduleLabel}」和当前消息上下文先帮你兜了一层回答。如果你想继续细分，可以直接追问某条消息要不要处理、来自哪个系统，或让我帮你整理下一步动作。`;
    }

    return `我已经基于「${moduleLabel}」当前页面先整理了一轮。你可以继续追问更具体的任务、入口、配置项或下一步动作，我会沿着这个工作面继续协同。`;
}

export default function GlobalFireflyDrawer() {
    const pathname = usePathname();

    const shouldRender = useMemo(() => {
        if (!pathname || pathname === '/') {
            return false;
        }

        return !localDrawerPrefixes.some((prefix) => pathname.startsWith(prefix));
    }, [pathname]);

    const moduleMeta = useMemo(() => resolveModuleTitle(pathname), [pathname]);
    const pageLabel = useMemo(() => pathnameToLabel(pathname), [pathname]);
    const contextSnapshot = useMemo(() => ({
        pathname,
        moduleLabel: moduleMeta?.label || '校园工作面',
        pageLabel,
    }), [moduleMeta?.label, pageLabel, pathname]);

    if (!shouldRender) {
        return null;
    }

    return (
        <div className="global-firefly-drawer-layer">
            <FireflySideDrawer
                storageNamespace="campus_global_firefly_drawer_v1"
                openStorageKey="campus_global_firefly_drawer_open_v1"
                threadKey={pathname}
                historyOrigin={`global:${pathname}`}
                title="萤火虫"
                launcherLabel="萤火虫"
                launcherHint="页面协同"
                description="在任意工作面直接拉出萤火虫，继续追问当前页面里的消息、接入能力或下一步动作。"
                emptyTitle="从当前页面继续问"
                emptyDescription="我会优先理解你现在所在的页面和正在处理的内容，再给出解释、归纳、下一步建议或跳转提示。"
                placeholder="继续追问当前页面里的问题"
                contextChips={[moduleMeta?.label || '校园工作面', pageLabel]}
                capabilityIds={moduleMeta?.capabilityId ? [moduleMeta.capabilityId] : []}
                contextSnapshot={contextSnapshot}
                buildContextMessage={buildGlobalContextMessage}
                buildFallbackReply={buildGlobalFallbackReply}
                panelClassName="global-firefly-panel"
                buildSession={({ thread, modelId, historyOrigin }) => {
                    if (thread.length === 0) {
                        return null;
                    }

                    const updatedAt = thread[thread.length - 1]?.time || new Date().toISOString();

                    return {
                        id: `global-${pathname}`,
                        title: `${contextSnapshot.moduleLabel} · ${pageLabel}`,
                        date: new Date(updatedAt).toLocaleDateString('zh-CN'),
                        updatedAt,
                        messages: thread.map((item) => ({
                            role: item.role === 'user' ? 'user' : 'ai',
                            content: item.content,
                            time: item.time,
                            modelId: item.modelId || modelId,
                        })),
                        meta: {
                            capabilityIds: moduleMeta?.capabilityId ? [moduleMeta.capabilityId] : [],
                            modelId,
                            webSearchEnabled: false,
                            deepResearchEnabled: false,
                            origin: historyOrigin,
                            pathname,
                        },
                    };
                }}
            />
        </div>
    );
}
