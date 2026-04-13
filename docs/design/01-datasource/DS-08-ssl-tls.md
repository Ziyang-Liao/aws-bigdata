# DS-08 SSL/TLS 连接配置

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
支持 SSL 模式选择（disable/prefer/require/verify-ca/verify-full），允许上传 CA 证书存储到 S3，SSL 参数自动传递到 JDBC URL 和 Glue Connection。RDS 默认使用 AWS 提供的 CA 证书。

## 2. 用户故事
- 作为安全管理员，我要求所有数据库连接必须使用 SSL 加密，以防止数据在传输中被窃听。
- 作为 DBA，我希望能上传自签名 CA 证书用于内部数据库的 SSL 连接。

## 3. 交互设计
```
数据源表单 → 高级选项 → SSL 配置:
┌──────────────────────────────────────────────┐
│ SSL 模式: [require ▼]                         │
│   disable    - 不使用 SSL                     │
│   prefer     - 优先 SSL，不强制               │
│   require    - 强制 SSL，不验证证书            │
│   verify-ca  - 强制 SSL + 验证 CA 证书        │
│   verify-full- 强制 SSL + 验证 CA + 主机名    │
│                                               │
│ CA 证书:                                      │
│   ● 使用 AWS RDS 默认证书                     │
│   ○ 上传自定义证书  [选择文件] ca-cert.pem     │
│                                               │
│ ℹ️ RDS 实例默认支持 SSL，推荐使用 require 模式 │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/datasources 增加 sslConfig:
{
  "sslConfig": {
    "mode": "require",
    "useRdsCa": true,
    "customCaCertS3Key": null
  }
}

POST /api/datasources/upload-cert
Content-Type: multipart/form-data
Body: file=ca-cert.pem
Response: { s3Key: "bgp-config/certs/ds-xxx-ca.pem" }
```

## 5. 数据模型
bgp-datasources 新增:
- sslConfig: Map { mode: String, useRdsCa: Boolean, customCaCertS3Key: String }

## 6. 后端实现方案
```
1. 证书上传: 存到 S3 bgp-glue-scripts-{account}/certs/{datasourceId}-ca.pem
2. JDBC URL SSL 参数拼接:
   MySQL:
     require: ?useSSL=true&requireSSL=true
     verify-ca: ?useSSL=true&requireSSL=true&verifyServerCertificate=true&trustCertificateKeyStoreUrl=file:/path/ca.pem
   PostgreSQL:
     require: ?sslmode=require
     verify-ca: ?sslmode=verify-ca&sslrootcert=/path/ca.pem
   Oracle:
     通过 JDBC properties: javax.net.ssl.trustStore=/path/truststore.jks
3. Glue Connection SSL:
   ConnectionProperties 中添加:
     JDBC_ENFORCE_SSL: "true"
     CUSTOM_JDBC_CERT: s3://bucket/certs/ca.pem
     CUSTOM_JDBC_CERT_STRING: (证书内容，小于 2KB 时)
4. RDS 默认证书: 自动下载 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

## 7. AWS 服务依赖
- S3 (证书存储)
- Glue (Connection SSL 属性)

## 8. 安全考虑
- 证书文件仅允许 .pem/.crt/.cer 格式，大小限制 100KB
- S3 存储使用 SSE-S3 加密
- verify-full 模式最安全，生产环境推荐
- 删除数据源时同步删除 S3 中的证书文件

## 9. 验收标准
- [ ] 支持 5 种 SSL 模式选择
- [ ] RDS 数据源默认使用 AWS CA 证书
- [ ] 支持上传自定义 CA 证书
- [ ] SSL 参数正确传递到 JDBC URL
- [ ] Glue Connection 支持 SSL 连接
- [ ] 测试连接时使用配置的 SSL 模式
