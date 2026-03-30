---
id: service-notice-digest
title: 通知分拣员
description: 把通知中心未读消息自动归并成待办、提醒和参考信息三类。
capability: services
owner: 学校数字校园中心
origin: school
provider: 学校官方
version: 1.0.0
entry: SKILL.md
status: enabled
market_status: limited
firefly_enabled: true
audience: 全校用户
connectors:
  - notice-center
invocation_modes:
  - chat
  - event
---
# 通知分拣员

## Purpose
降低用户逐条阅读消息的成本，把校园通知先做优先级判断，再决定是否需要回到系统详情页。

## Inputs
- 当日通知列表
- 未读状态
- 消息来源与时间

## Workflow
- 读取通知中心的最近消息。
- 根据来源、未读状态和主题词做分组。
- 生成需要马上处理、建议查看和仅供参考三类摘要。

## Outputs
- 输出一份可直接给萤火虫解释的消息摘要。
- 在必要时附带建议动作和跳转入口。

## Safety
- 不得改变通知本身状态，除非获得明确授权。
- 涉及附件或富文本详情时需要保留原始入口，避免误读。
