---
id: mcp-library-search
title: 图书馆检索 MCP
description: 将馆藏检索、借阅状态和电子资源入口以标准工具形式暴露给校园 OS。
capability: library
owner: 图书馆
provider: 学校图书馆
version: 1.0.0
entry: MCP.md
status: ready
transport: streamable_http
protocol_version: 2026-03-01
manifest_path: /.well-known/mcp.json
endpoint: https://library.example.edu.cn/mcp
scope: 馆藏检索 / 借阅状态 / 电子资源
auth_modes:
  - sso_session
  - bearer_token
expected_tools:
  - search_catalog
  - get_borrow_records
  - open_eresource
expected_resources:
  - library_profile
  - campus_holdings
---
# 图书馆检索 MCP

## Purpose
把图书馆馆藏检索、借阅信息与电子资源入口抽成标准协议能力，供 AI 图书馆与萤火虫统一调用。

## Contract
- Transport：streamable_http
- Protocol Version：2026-03-01
- Endpoint：https://library.example.edu.cn/mcp
- Manifest：/.well-known/mcp.json

## Auth
- sso_session
- bearer_token

## Tools
- search_catalog
- get_borrow_records
- open_eresource

## Resources
- library_profile
- campus_holdings

## Safety
- 电子资源通常受版权与校园网策略约束，需要明确跳转边界。
- 治理说明：属于最适合优先做成标准协议的校园资源型能力。
