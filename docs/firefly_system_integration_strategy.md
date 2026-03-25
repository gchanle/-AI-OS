# Firefly System Integration Strategy

Updated: 2026-03-26

## Goal

让萤火虫不只是“会说话的校园助手”，而是能真正进入系统、拿到数据、组织任务，并在必要时完成轻量操作的校园 Agent。

## Core Principle

优先采用对用户最有价值、最稳定、最合规的接入方式，而不是为了“看起来很智能”去堆脆弱的自动化。

建议按以下优先级落地：

1. 官方 API / 数据接口
2. 官方单点登录 / token handoff / 页面深链接
3. 受控浏览器自动化
4. 高风险系统仅做人机协同，不做全自动

## Recommended Architecture

### 1. Firefly orchestration layer

萤火虫负责：

- 判断用户意图属于查询、整理、解释、办事、跨系统任务还是需要联网搜索/深度研究
- 决定调用哪个校园能力
- 维护会话状态
- 把来自系统的数据整理成可执行结果

这一层建议长期沉淀成：

- Firefly planner
- Firefly tools / adapters
- Firefly memory / task state
- Firefly audit log

### 2. Adapter layer

每个系统都不要直接在对话里硬编码，要做成统一 adapter。

建议统一输出结构：

```ts
type CampusAdapterResult = {
  source: string;
  entityType: 'course' | 'assignment' | 'approval' | 'notice' | 'library_item' | 'search_result';
  summary: string;
  raw?: unknown;
  actions?: Array<{
    id: string;
    label: string;
    requiresConfirmation?: boolean;
  }>;
}
```

这样萤火虫只需要理解统一结果，不需要理解每个系统的 HTML 差异。

### 3. Action safety layer

任何写操作都建议分成两段：

1. Firefly 先准备动作
2. 用户确认后再真正提交

典型写操作：

- 提交请假
- 发起审批
- 预约图书馆空间
- 修改课程设置
- 导出或提交阅读笔记

## If There Is No API

可以做浏览器自动化，但不能把它当成默认主路径。

### 可行方案

- 用 Playwright / browser automation 登录目标系统
- 在用户授权后读取页面数据
- 把结构化结果回传给萤火虫
- 对关键写操作做二次确认

### 适合的使用边界

- 查询课表
- 拉取作业和 deadline
- 读取未读通知
- 读取图书借阅状态
- 提交低风险、幂等型表单

### 不建议直接全自动的场景

- 金额相关审批
- 高风险行政提交
- 涉及验证码、二次校验、强身份核验的动作
- 会造成不可逆状态变更的流程

## How Market Products Usually Do This

### Route A: API-first

企业级 Copilot / 企业智能体更多走 API-first：

- 稳定
- 可审计
- 易维护

适合校园：

- 图书馆数据
- 教务只读数据
- 通知与消息聚合

### Route B: Browser automation as fallback

当没有接口时，市场上常见做法是：

- 浏览器代理
- RPA
- Agent + Playwright
- 人机协同点击

适合校园：

- 办事大厅
- 助教系统
- 老旧科研平台

### Route C: Deep link + task handoff

不是所有事情都该让萤火虫“自己做完”。

很多时候更好的体验是：

- 萤火虫先整理上下文
- 再把用户送到正确页面
- 页面中保留预填内容或任务上下文

这种方式成本低，用户体感反而更稳。

## Specific Recommendation For This Project

### Stage 1: Useful and controllable

优先打通三类高价值只读能力：

- 教务任务拉取
- 图书馆检索与借阅状态
- 校园通知与办事待办

对应做法：

- 有接口就 adapter
- 没接口就受控浏览器读取
- Firefly 统一解释和整理

### Stage 2: Safe write actions

优先接这类低风险动作：

- 图书馆阅读任务生成
- 研读笔记整理
- 预约类流程的草稿生成
- 表单预填

### Stage 3: Real cross-system workflows

让萤火虫真正有粘性的不是“回答问题”，而是跨系统把事推进。

示例：

- 拉取本周课程 -> 找出相关馆藏 -> 生成阅读计划 -> 拆成任务
- 拉取 deadline -> 对照图书馆资料 -> 生成论文综述提纲
- 从科研平台拿到检索结果 -> 转成图书馆书单和阅读笔记任务

## Tools Worth Considering

- [Playwright](https://playwright.dev/)
  适合受控浏览器自动化与 DOM 级读取。
- [browser-use](https://github.com/browser-use/browser-use)
  适合把浏览器自动化升级为 Agent 行为，但运维与稳定性成本更高。
- OpenAlex API
  适合作为开放学术图谱和论文关系检索的底座。
  官方文档：[OpenAlex Developers](https://developers.openalex.org)

## Product Advice

用户真正愿意长期使用萤火虫，靠的是三件事：

1. 它能记住并持续推进任务
2. 它真的能拿到系统里的数据
3. 它能把多个系统之间的信息串起来

如果只能聊天、不能落到任务和系统数据上，用户粘性会很快下降。

## Immediate Next Steps

1. 为 `AI 办事 / AI 助教 / AI 图书馆 / AI 科研` 建立统一 adapter contract。
2. 图书馆能力优先做深，因为它最适合与萤火虫形成强耦合闭环。
3. 对无 API 系统，先做“只读拉取 + 人工确认写入”，不要直接全自动。
4. 为所有自动化动作记录 audit log，保证可追溯。
