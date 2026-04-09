---
id: cli-campus-agent
title: 客户侧任务代理 CLI
description: 为学校机房内的计划任务、同步作业和受控命令执行提供统一代理入口。
capability: agents
owner: 学校运维
provider: 学校运维
version: 1.0.0
entry: CLI.md
status: design
runner_type: managed_daemon
execution_mode: scheduled
command: campus-agent-runner
package_ref:
working_directory: /srv/campus-agent
auth_modes:
  - vault_secret
  - operator_token
supported_os:
  - Linux
---
# 客户侧任务代理 CLI

## Purpose
用于在客户机房内承接计划任务、同步作业和受控执行，作为校园 OS 的客户侧代理层。

## Inputs
- 任务计划
- 任务 payload
- 安全策略

## Outputs
- 执行结果
- 状态回执
- 巡检事件

## Install
- 命令：campus-agent-runner
- 工作目录：/srv/campus-agent
- Package Ref：待补充
- 安装说明：计划在客户机房内以守护进程形式部署，用于同步消息、巡检能力与受控执行任务。
- 支持环境：
- Linux

## Safety
- vault_secret
- operator_token
- 必须明确命令白名单和租户隔离，否则容易越界成通用执行器。
- 治理说明：仍处设计阶段，当前不能对外宣称已可调用。
