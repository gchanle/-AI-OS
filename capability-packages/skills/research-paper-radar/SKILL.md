---
id: research-paper-radar
title: 科研线索雷达
description: 围绕科研主题生成检索线索、候选论文方向和平台接力建议。
capability: research
owner: 超星 AI Research
origin: chaoxing
provider: 超星
version: 1.0.0
entry: SKILL.md
status: review
market_status: review
firefly_enabled: false
audience: 教师 / 研究生 / 科研秘书
connectors:
  - bohrium-research
invocation_modes:
  - chat
  - workflow
---
# 科研线索雷达

## Purpose
帮助用户先在萤火虫里把研究问题收敛成检索主题、比较维度和后续动作，再决定是否进入科研平台深挖。

## Inputs
- 用户研究主题
- 研究阶段与目标
- 科研平台候选入口

## Workflow
- 识别研究主题和预期成果形态。
- 给出关键词、子问题和比较维度。
- 判断是否需要把用户接力到科研平台继续查找资料。

## Outputs
- 输出一份结构化检索框架和下一步建议。
- 如果适合进入平台，则给出接力方向和原因。

## Safety
- 不得伪造论文、作者或实验结果。
- 若未拿到真实平台返回，只能输出研究建议，不输出“已检索到”的假结果。
