function matchesUnreadSummaryIntent(question = '') {
    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) {
        return false;
    }

    if (/未读消息|学习通|校园通知|站内信|消息中心|通知中心|未读通知|校园提醒|维度消息|收件箱/.test(normalizedQuestion)) {
        return true;
    }

    return /消息/.test(normalizedQuestion) && /最近|最新|我的|帮我看|帮我查|获取|整理|汇总|报告|简报|文档/.test(normalizedQuestion);
}

function matchesApprovalSummaryIntent(question = '') {
    return /审批|待办|流程|我发起|待我审批|AI ?办事/.test(String(question || '').trim());
}

function matchesCampusHelpIntent(question = '') {
    return /学习通|超星|校园|教务|课程|考试|选课|查课|学校通知|办事大厅|统一身份认证|校园卡|成绩/.test(String(question || '').trim());
}

function matchesGreetingIntent(question = '') {
    return /^(你好|您好|嗨|hi|hello|晚上好|早上好|下午好|在吗|你是谁)[!！。,. ]*$/i.test(String(question || '').trim());
}

function matchesExternalKnowledgeIntent(question = '') {
    const normalized = String(question || '').trim();
    if (!normalized) {
        return false;
    }

    const explicitLookupSignal = /查一下|查查|搜一下|搜搜|帮我查|帮我搜|检索|搜索|了解一下|告诉我|科普一下|介绍一下/.test(normalized);
    const encyclopedicSignal = /什么时候|哪一年|哪天|是谁|是什么|在哪|哪里|多少|多大|几岁|完结|上映|发布|成立|去世|出生|首播|结局|结尾|最后一次|合拍|播出|播完|收官|结婚|离婚|获奖|票房|评分/.test(normalized);
    const publicSubjectSignal = !matchesCampusHelpIntent(normalized)
        && !matchesUnreadSummaryIntent(normalized)
        && !matchesApprovalSummaryIntent(normalized)
        && !matchesGreetingIntent(normalized)
        && !/我的|我这边|帮我处理|待办|审批|未读|消息|文件|工作区|继续推进|开始吧|恢复任务/.test(normalized);

    return publicSubjectSignal && (explicitLookupSignal || encyclopedicSignal);
}

function matchesGeneralPublicKnowledgeIntent(question = '') {
    const normalized = String(question || '').trim();
    if (!normalized) {
        return false;
    }

    if (!/[？?]|谁|什么|哪里|哪儿|如何|怎样|为啥|为什么|时间|日期|最后|最近|最新|历史|背景|原因|经过|影响|评价|介绍|资料|信息|情况|进展|动态|局势|新闻|事件/.test(normalized)) {
        return false;
    }

    const campusOrPrivateSignal = matchesCampusHelpIntent(normalized)
        || matchesUnreadSummaryIntent(normalized)
        || matchesApprovalSummaryIntent(normalized)
        || matchesGreetingIntent(normalized)
        || /我的|我这边|帮我处理|待办|审批|未读|消息|文件|工作区|继续推进|开始吧|恢复任务|帮我发|帮我写|给我生成/.test(normalized);

    if (campusOrPrivateSignal) {
        return false;
    }

    return /老友记|friends|美国|伊朗|中国|日本|OpenAI|谷歌|苹果|特斯拉|马斯克|特朗普|拜登|俄乌|乌克兰|巴以|哈马斯|以色列|关税|股市|金价|油价|比特币|电影|电视剧|动漫|游戏|公司|品牌|人物|明星|大学|国家|城市|战争|新闻|局势|事件|历史/.test(normalized)
        || matchesExternalKnowledgeIntent(normalized);
}

export function isWorkspaceIntent(question = '') {
    return /保存到工作区|写入工作区|存到工作区|落到工作区|生成文件|保存成文件|导出到工作区|发布到输出区|发布产物|outputs|产物清单|manifest|读取工作区|查看工作区/.test(String(question || '').trim());
}

export function isAgentTaskIntent(question = '') {
    return /继续推进|继续处理|继续做|继续吧|开始吧|启动|执行任务|帮我执行|拆解任务|规划一下|做成文档|整理成文档|整理成报告|整理成简报|生成汇报|输出报告|多步|工作流|跟进这个任务|恢复这个任务|记忆|memory|工具箱|toolbelt|固定工具|启用工具|整理记忆|查看记忆/.test(String(question || '').trim());
}

export function isDirectUrlTask(question = '') {
    return /https?:\/\/\S+/i.test(String(question || '').trim());
}

export function isCampusSummaryIntent(question = '') {
    const normalized = String(question || '').trim();
    return (
        (matchesUnreadSummaryIntent(normalized) || matchesApprovalSummaryIntent(normalized))
        && /汇总|整理|总结|概览|优先级|建议|帮我看|帮我查|哪些|今天|最近/.test(normalized)
    );
}

export function shouldInjectCampusContext(question = '') {
    const normalized = String(question || '').trim();
    if (!normalized) {
        return false;
    }

    return matchesUnreadSummaryIntent(normalized)
        || matchesApprovalSummaryIntent(normalized)
        || matchesCampusHelpIntent(normalized);
}

export function isFreshWebSearchIntent(question = '') {
    const normalized = String(question || '').trim();
    if (!normalized) {
        return false;
    }

    const explicitFreshSignal = /最新|最近|刚刚|今日|今天|昨日|昨天|本周|本月|目前|现在|刚才|最新消息|最新新闻|头条|快讯|热点|热搜|新闻|局势|战况|冲突|动态|进展|发生了什么|现状|近况|update|latest|news|recent/i.test(normalized);
    const publicTopicSignal = /伊朗|美国|中美|俄乌|乌克兰|巴以|以色列|哈马斯|叙利亚|特朗普|拜登|关税|股市|美股|A股|港股|汇率|金价|油价|比特币|BTC|AI|OpenAI|谷歌|苹果|特斯拉/.test(normalized);
    const searchVerbSignal = /查一下|查查|搜一下|搜搜|看一下|看看|帮我查|帮我搜|检索|搜索|了解一下/.test(normalized);

    return explicitFreshSignal || (publicTopicSignal && (explicitFreshSignal || searchVerbSignal));
}

export function shouldUseWebSearch(question = '', { webSearchEnabled = false, deepResearchEnabled = false } = {}) {
    const normalized = String(question || '').trim();
    if (!normalized) {
        return false;
    }

    if (
        matchesUnreadSummaryIntent(normalized)
        || matchesApprovalSummaryIntent(normalized)
        || /我的|我这边|个人|当前账号|校园消息|校园审批|学习通/.test(normalized)
    ) {
        return false;
    }

    if (deepResearchEnabled) {
        return true;
    }

    if (isFreshWebSearchIntent(normalized)) {
        return true;
    }

    if (webSearchEnabled && (matchesExternalKnowledgeIntent(normalized) || matchesGeneralPublicKnowledgeIntent(normalized))) {
        return true;
    }

    return matchesExternalKnowledgeIntent(normalized);
}

export function decideFireflyResponseMode({
    question = '',
    webSearchEnabled = false,
    deepResearchEnabled = false,
    runtimeContext = {},
    hasRuntimeRecovery = false,
} = {}) {
    const normalized = String(question || '').trim();

    if (runtimeContext?.resumeMode || hasRuntimeRecovery) {
        return { id: 'agent', label: 'agent', reason: 'resume_context' };
    }

    if (isWorkspaceIntent(normalized)) {
        return { id: 'workspace', label: 'workspace', reason: 'workspace_intent' };
    }

    if (deepResearchEnabled) {
        return { id: 'agent', label: 'deep_research', reason: 'deep_research_enabled' };
    }

    if (isAgentTaskIntent(normalized) || isDirectUrlTask(normalized)) {
        return { id: 'agent', label: 'agent', reason: 'explicit_agent_signal' };
    }

    if (shouldUseWebSearch(normalized, { webSearchEnabled, deepResearchEnabled })) {
        return {
            id: 'search',
            label: 'search',
            reason: isFreshWebSearchIntent(normalized) ? 'fresh_web_search_intent' : 'web_search_enabled_lookup',
        };
    }

    if (isCampusSummaryIntent(normalized)) {
        return { id: 'direct', label: 'direct', reason: 'campus_summary_direct' };
    }

    return { id: 'direct', label: 'direct', reason: 'default_direct' };
}
