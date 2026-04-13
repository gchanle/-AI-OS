---
id: mcp-servicehall-stream
title: 办事大厅 Service Hall MCP
description: 复用办事大厅登录态，通过 MCP 流式端点统一查询应用、消息通知和审批事项。
capability: services
owner: 超星办事大厅
provider: 超星
version: 1.0.0
entry: MCP.md
status: pilot
transport: streamable_http
protocol_version: 2026-04-09
manifest_path: /homepage/mcp/stream
endpoint: https://servicehall.chaoxing.com/homepage/mcp/stream
scope: 应用搜索 / 消息通知 / 审批事项
auth_modes:
  - sso_session
  - customer_proxy
expected_tools:
  - search_apps
  - search_notices
  - search_approvals
expected_resources:
  - servicehall_profile
  - approval_profile
  - notice_profile
---
# 办事大厅 Service Hall MCP

## Purpose
在办事大厅登录态下，把应用门户、消息通知和审批事项统一暴露为可编排的 MCP 工具，供萤火虫后续直接调用。

## Contract
- Transport：streamable_http
- Protocol Version：2026-04-09
- Endpoint：https://servicehall.chaoxing.com/homepage/mcp/stream
- Manifest：/homepage/mcp/stream

## Auth
- sso_session
- customer_proxy

## Tools
- search_apps
- search_notices
- search_approvals

## Resources
- servicehall_profile
- approval_profile
- notice_profile

## Safety
- 当前端点在未登录时会返回“登录已超时”，调用前必须确认浏览器或代理会话已建立。
- 工具返回内容必须经过字段映射与 Markdown 安全处理，禁止直接把原始 JSON 暴露给用户。
- 治理说明：当前已确认端点真实存在，但协议细节和工具入参仍需结合登录态继续验证。
