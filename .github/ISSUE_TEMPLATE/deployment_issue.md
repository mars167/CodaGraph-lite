---
name: 部署问题
about: 报告部署相关的问题
title: '[DEPLOY] '
labels: deployment
assignees: ''
---

## 部署环境

| 项目 | 值 |
|------|-----|
| 操作系统 | 例如：Ubuntu 22.04 |
| 内存 | 例如：2GB |
| CPU | 例如：1 vCPU |
| 磁盘 | 例如：40GB |
| 部署方式 | systemd / PM2 / Docker |
| CodaGraph-lite 版本 | 例如：v1.0.0 |

## 问题描述

详细描述部署过程中遇到的问题。

## 复现步骤

1. 执行的操作...
2. 错误信息...

## 错误日志

```bash
# 粘贴相关的错误日志
```

## 验证结果

运行部署验证脚本的结果：

```bash
bash deploy/verify.sh
```

## 环境配置

```bash
# 粘贴 .env 文件的相关配置（隐藏敏感信息）
ADMIN_USERNAME=***
ADMIN_PASSWORD=***
...
```

## 已尝试的解决方案

描述您已经尝试过的解决方案。

## 附加信息

任何其他可能有帮助的信息。
