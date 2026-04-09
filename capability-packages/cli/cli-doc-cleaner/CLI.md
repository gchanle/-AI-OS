---
id: cli-doc-cleaner
title: 文档清洗 CLI
description: 负责附件清洗、OCR、文本抽取与分段，适合办事、图书馆和科研场景的本地预处理。
capability: library
owner: 平台能力中心
provider: 超星 AI Campus
version: 1.0.0
entry: CLI.md
status: pilot
runner_type: batch_worker
execution_mode: operator_managed
command: campus-doc-clean
package_ref: chaoxing/doc-cleaner@0.9.4
working_directory: /opt/chaoxing/doc-tools
auth_modes:
  - operator_token
  - vault_secret
supported_os:
  - Linux
---
# 文档清洗 CLI

## Purpose
为附件类任务提供 OCR、清洗、文本抽取和分段能力，供图书馆和办事流程继续处理。

## Inputs
- 文件路径
- OCR 开关
- 分段策略

## Outputs
- 清洗文本
- OCR 结果
- 结构化段落

## Install
- 命令：campus-doc-clean
- 工作目录：/opt/chaoxing/doc-tools
- Package Ref：chaoxing/doc-cleaner@0.9.4
- 安装说明：由学校运维统一部署，平台按文件任务调用，结果再回传上层流程。
- 支持环境：
- Linux

## Safety
- operator_token
- vault_secret
- 需要明确附件的落盘与留存策略，避免原文被长期保留。
- 治理说明：当前适合先做平台侧受控试点，不建议直接对个人终端开放。
