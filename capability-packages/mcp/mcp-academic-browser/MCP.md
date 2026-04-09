---
id: mcp-academic-browser
title: 教务浏览器代理 MCP
description: 适合没有开放 API，但已接统一认证的教务系统，以浏览器代理方式提供结构化读取。
capability: services
owner: 教务处 / 信息化中心
provider: 学校信息化中心
version: 1.0.0
entry: MCP.md
status: pilot
transport: websocket
protocol_version: 2026-03-01
manifest_path: /.well-known/mcp.json
endpoint: wss://campus.example.edu.cn/mcp/academic-browser
scope: 课表 / 考试 / 成绩只读
auth_modes:
  - sso_session
  - customer_proxy
expected_tools:
  - get_timetable
  - get_exam_schedule
  - get_grade_summary
expected_resources:
  - academic_calendar
  - term_context
---
# 教务浏览器代理 MCP

## Purpose
用于把没有开放 API 的教务系统，通过受控浏览器代理方式接入校园 OS。

## Contract
- Transport：websocket
- Protocol Version：2026-03-01
- Endpoint：wss://campus.example.edu.cn/mcp/academic-browser
- Manifest：/.well-known/mcp.json

## Auth
- sso_session
- customer_proxy

## Tools
- get_timetable
- get_exam_schedule
- get_grade_summary

## Resources
- academic_calendar
- term_context

## Safety
- 依赖浏览器代理与已登录会话，学校终端部署方式需要明确。
- 成绩等敏感数据必须保持只读并接审计。
- 治理说明：适合先在学校自有终端范围试点，稳定后再进入更广范围。
