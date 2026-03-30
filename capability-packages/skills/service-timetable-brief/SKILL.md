---
id: service-timetable-brief
title: 课表摘要助手
description: 把教务课表、考试安排和通知提醒整合成适合萤火虫继续解释的办事技能。
capability: services
owner: 超星 AI Campus
origin: chaoxing
provider: 超星
version: 1.0.0
entry: SKILL.md
status: enabled
market_status: listed
firefly_enabled: true
audience: 学生 / 辅导员 / 教务秘书
connectors:
  - academic-affairs
  - notice-center
invocation_modes:
  - chat
  - workflow
---
# 课表摘要助手

## Purpose
围绕“查明天课表”“看这周有没有考试”“课程是否有临时变化”这类高频校园办事问题，把多个系统返回结果整理成一个更适合萤火虫解释和继续推进的能力单元。

## Inputs
- 用户自然语言问题
- AI 办事 当前上下文
- 教务与通知相关连接器返回结果

## Workflow
- 先由萤火虫判断用户是否属于课表、考试或课程变更场景。
- 如果需要实时数据，则调用教务系统与通知中心连接器。
- 对课程时间、地点、考试安排和通知做统一排序与摘要。

## Outputs
- 输出一份适合对话展示的课表或考试清单。
- 在结果中标记最值得提醒的变化或冲突。

## Safety
- 不得在没有真实结果时编造课程信息。
- 涉及成绩、敏感学籍数据时只返回获授权的字段。
