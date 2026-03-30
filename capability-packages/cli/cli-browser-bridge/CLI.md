---
id: cli-browser-bridge
title: 浏览器桥接 CLI
description: 在客户终端复用已登录浏览器会话，适合没有 API 的教务、办事或历史系统做受控读取。
capability: services
owner: 学校信息化中心
provider: 客户侧代理
version: 1.0.0
entry: CLI.md
status: ready
runner_type: browser_bridge
execution_mode: user_session
command: campus-browser-bridge
package_ref: chaoxing/campus-browser-bridge@1.3.0
working_directory: /opt/chaoxing/campus-agent
auth_modes:
  - sso_session
  - vault_secret
supported_os:
  - macOS
  - Windows
---
# 浏览器桥接 CLI

## Purpose
为无 API 的校园系统提供受控浏览器动作执行与结构化结果提取能力。

## Inputs
- 访问路径
- 页面动作配置
- 结构化提取规则

## Outputs
- HTML 快照
- 结构化 JSON
- 执行审计日志

## Install
- 命令：campus-browser-bridge
- 工作目录：/opt/chaoxing/campus-agent
- Package Ref：chaoxing/campus-browser-bridge@1.3.0
- 安装说明：部署到校内终端后，由校园 OS 通过受控命令触发，复用当前用户已登录浏览器。
- 支持环境：
- macOS
- Windows

## Safety
- sso_session
- vault_secret
- 必须限制可访问域名与页面动作，避免被滥用为通用浏览器自动化。
- 涉及个人课表、成绩等敏感数据时，需要保留审计。
- 治理说明：适合作为无 API 系统接入的兜底方案，但只能在受控学校终端中运行。
