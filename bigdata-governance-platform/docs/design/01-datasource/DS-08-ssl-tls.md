# DS-08 SSL/TLS 连接配置

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
支持 SSL 模式选择(disable/prefer/require/verify-ca/verify-full)，允许上传 CA 证书，SSL 参数传递到 JDBC URL 和 Glue Connection。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便提升数据源管理的效率和安全性。

## 3. 交互设计
见功能概述中的描述。

## 4. API 设计
```
前端: 数据源表单高级选项中增加 SSL 配置区域\n  SSL 模式: [disable ▼]\n  CA 证书: [上传文件] 或 [使用 RDS 默认证书]\n\nAPI: POST /api/datasources 增加 sslConfig 字段\n{\n  sslConfig: {\n    mode: 'require',\n    caCertS3Key: 's3://bgp-config/certs/xxx.pem'\n  }\n}
```

## 5. 数据模型
bgp-datasources 新增: sslConfig: Map { mode, caCertS3Key }

## 6. 后端实现方案
```
前端: 数据源表单高级选项中增加 SSL 配置区域\n  SSL 模式: [disable ▼]\n  CA 证书: [上传文件] 或 [使用 RDS 默认证书]\n\nAPI: POST /api/datasources 增加 sslConfig 字段\n{\n  sslConfig: {\n    mode: 'require',\n    caCertS3Key: 's3://bgp-config/certs/xxx.pem'\n  }\n}
```

## 7. AWS 服务依赖
1. 前端上传证书到 S3 (bgp-config-{account}/certs/)\n2. JDBC URL 追加 SSL 参数:\n   mysql: ?useSSL=true&requireSSL=true&verifyServerCertificate=true\n   pg: ?sslmode=verify-ca&sslrootcert=xxx\n3. Glue Connection 添加 SSL 属性

## 8. 安全考虑
S3 (存储证书), Glue Connection SSL 属性

## 9. 验收标准
- 证书文件加密存储\nSSL 模式默认 prefer\n生产环境建议 verify-ca 以上|[ ] 支持 5 种 SSL 模式\n[ ] CA 证书可上传并存储到 S3\n[ ] SSL 参数正确传递到 JDBC URL\n[ ] Glue Connection 支持 SSL
