---
id: mcp-response-formatter
title: MCP 响应格式化器
description: 规范 Service Hall MCP 与相近查询工具的输出格式，优先渲染为安全的 Markdown 表格或列表。
capability: services
owner: 当前用户
origin: personal
provider: 当前租户
version: 1.2.0
entry: SKILL.md
status: enabled
market_status: private
firefly_enabled: true
audience: 校园用户
connectors:
  - service-hall
  - notice-center
invocation_modes:
  - chat
  - workflow
---
# MCP 响应格式化器

## Purpose
把 MCP 工具或等价查询工具返回的真实数据转成清晰、可读、可点击的 Markdown 表格或列表，避免把原始 JSON 直接暴露给用户。

## Inputs
- 应用门户查询结果
- 消息通知查询结果
- 审批事项查询结果
- 原始标题、链接、处理人/发件人、时间等基础字段

## Workflow
- 必须先调用真实工具获取数据，禁止脱离工具自行编造结果。
- 对标题、链接和表格单元格做 Markdown 安全处理，避免引号、方括号或竖线破坏结构。
- 消息与审批优先输出为 Markdown 表格，应用门户优先输出为链接列表。
- 如果结果为空，统一返回“暂无相关信息”，不要展示空表格。

## Outputs
- 审批事项输出为 `标题 / 处理人 / 发起时间` 三列表格。
- 消息通知输出为 `标题 / 发件人 / 发件时间` 三列表格。
- 应用门户输出为仅包含应用名称与链接的列表。
- 所有输出都应在展示内容之后补一行简短统计总结。

## Safety
- 禁止泄露原始 JSON、调试报文或冗余字段。
- 缺少链接时可退回纯文本标题，但不能伪造跳转地址。
- 若上游工具失败，应直接透出失败原因，不得回退为旧数据继续误导用户。
