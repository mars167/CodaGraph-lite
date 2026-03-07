# Jest 测试框架配置

本目录包含 CodaGraph-lite 的测试框架配置和工具函数。

## 文件说明

- `jest.config.js` - 后端 Jest 配置
- `jest.setup.js` - 测试环境设置
- `mocks/` - Mock 数据和函数

## 覆盖率目标

- **单元测试**: ≥ 80%
- **集成测试**: ≥ 70%
- **端到端测试**: ≥ 60%

## 运行测试

```bash
# 运行所有测试
npm test

# 监听模式（自动重运行）
npm run test:watch

# 覆盖率报告
npm run test:coverage

# 查看覆盖率报告
open coverage/index.html
```
