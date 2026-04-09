---
id: mcp-notice-sync
title: 通知同步 MCP
description: 适合把消息中心、待办和通知系统做成统一的消息接入协议。
capability: services
owner: 平台消息中心
provider: 超星
version: 1.0.0
entry: MCP.md
status: design
transport: sse
protocol_version: 2026-03-01
manifest_path: /.well-known/mcp.json
endpoint:
scope: 消息同步 / 通知详情 / 未读状态
auth_modes:
  - sso_session
expected_tools:
  - list_notices
  - get_notice_detail
  - sync_unread_state
expected_resources:
  - notice_profile
---
# 通知同步 MCP

## Purpose
为校园 OS 的消息中心、萤火虫和待办流转提供标准化的通知读取与状态同步协议。

## Contract
- Transport：sse
- Protocol Version：2026-03-01
- Endpoint：待设计
- Manifest：/.well-known/mcp.json

## Auth
- sso_session

## Tools
- list_notices
- get_notice_detail
- sync_unread_state

## Resources
- notice_profile

## Safety
- 若第三方通知系统不提供标准协议，需要回退到连接器或页面解析方案。
- 治理说明：当前仍处方案设计阶段，不能对外宣称已接入。
