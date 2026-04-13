# DS-16 连接测试详细报告

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
增强连接测试，分步检查：1)网络连通性 2)身份认证 3)权限检查 4)延迟测量。返回结构化报告，失败时给出修复建议。

## 2. 用户故事
- 作为数据开发者，我希望连接测试失败时能看到具体哪一步失败了以及如何修复，而不是只看到一个笼统的错误信息。

## 3. 交互设计
```
测试连接结果:
┌──────────────────────────────────────┐
│ ✅ 网络连通性   可达 (延迟 23ms)      │
│ ✅ 身份认证     登录成功              │
│ ✅ 权限检查     SELECT ✓ SHOW ✓      │
│ ✅ 数据库访问   ecommerce (3 张表)    │
│                                       │
│ 总耗时: 156ms                         │
└──────────────────────────────────────┘

失败示例:
┌──────────────────────────────────────┐
│ ✅ 网络连通性   可达 (延迟 23ms)      │
│ ❌ 身份认证     Access denied         │
│                                       │
│ 💡 修复建议:                          │
│   1. 检查用户名和密码是否正确          │
│   2. 确认用户有远程登录权限            │
│   3. MySQL: GRANT ALL ON *.* TO 'user'@'%' │
└──────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/datasources/test
Request: { type, host, port, database, username, password }
Response: {
  success: false,
  steps: [
    { name: "network", status: "pass", message: "可达", latencyMs: 23 },
    { name: "auth", status: "fail", message: "Access denied for user 'admin'@'10.0.2.x'",
      suggestions: ["检查用户名和密码", "确认远程登录权限", "GRANT ALL ON *.* TO ..."] },
    { name: "permission", status: "skip", message: "前置步骤失败" },
    { name: "database", status: "skip", message: "前置步骤失败" }
  ],
  totalMs: 156
}
```

## 5. 数据模型
无新增，测试结果实时返回不持久化。可选: 存入 bgp-datasources.lastTestResult。

## 6. 后端实现方案
```
1. 网络检查: TCP Socket connect to host:port (timeout 5s)
2. 认证检查: 通过 Glue CreateConnection + TestConnection
3. 权限检查: 执行 SHOW DATABASES, SHOW TABLES, SELECT 1
4. 数据库检查: 连接指定 database，获取表数量
5. 每步独立 try-catch，前步失败后续标记 skip
6. 失败时根据错误类型匹配修复建议模板
```

## 7. AWS 服务依赖
- Glue (CreateConnection, TestConnection)
- EC2 (网络层 TCP 检测可通过 Lambda in VPC)

## 8. 安全考虑
- 测试过程中密码不记录到日志
- TCP 检测超时保护 (5秒)
- 权限检查使用只读操作

## 9. 验收标准
- [ ] 测试结果分 4 步展示，每步独立状态
- [ ] 失败时显示具体错误信息和修复建议
- [ ] 网络不通时不尝试认证（快速失败）
- [ ] 显示总耗时和每步延迟
