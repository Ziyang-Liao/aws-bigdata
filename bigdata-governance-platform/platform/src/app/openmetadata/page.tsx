"use client";

import React, { useEffect, useState } from "react";
import { Card, Button, Space, Spin, Alert, Descriptions, Tag, Row, Col } from "antd";
import { LinkOutlined, CheckCircleOutlined, DatabaseOutlined, ApartmentOutlined, SearchOutlined } from "@ant-design/icons";

export default function OpenMetadataPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/openmetadata/url").then((r) => r.json()).then(setStatus).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;

  const isUp = !!status?.version;
  // Access OM via its own CloudFront domain
  const omBase = status?.url || "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>数据治理中心</h2>
        {isUp && (
          <Button type="primary" size="large" icon={<LinkOutlined />} onClick={() => window.open(omBase, "_blank")}>
            打开 OpenMetadata 控制台
          </Button>
        )}
      </div>

      {!isUp ? (
        <Alert type="warning" message="OpenMetadata 服务未就绪" description={status?.error || "请检查部署状态"} showIcon />
      ) : (
        <>
          <Card style={{ marginBottom: 24 }}>
            <Descriptions column={3}>
              <Descriptions.Item label="状态"><Tag icon={<CheckCircleOutlined />} color="success">运行中</Tag></Descriptions.Item>
              <Descriptions.Item label="版本">{status.version}</Descriptions.Item>
              <Descriptions.Item label="访问地址"><a href={omBase} target="_blank">{window.location.origin}/om</a></Descriptions.Item>
            </Descriptions>
          </Card>

          <Row gutter={16}>
            <Col span={8}>
              <Card hoverable onClick={() => window.open(`${omBase}/explore/tables`, "_blank")}>
                <Card.Meta avatar={<DatabaseOutlined style={{ fontSize: 32, color: "#1677ff" }} />}
                  title="数据目录" description="浏览所有数据资产、表、主题、仪表板" />
              </Card>
            </Col>
            <Col span={8}>
              <Card hoverable onClick={() => window.open(`${omBase}/lineage`, "_blank")}>
                <Card.Meta avatar={<ApartmentOutlined style={{ fontSize: 32, color: "#52c41a" }} />}
                  title="数据血缘" description="查看表级和列级血缘关系" />
              </Card>
            </Col>
            <Col span={8}>
              <Card hoverable onClick={() => window.open(`${omBase}/data-quality`, "_blank")}>
                <Card.Meta avatar={<SearchOutlined style={{ fontSize: 32, color: "#faad14" }} />}
                  title="数据质量" description="配置和查看数据质量规则与测试结果" />
              </Card>
            </Col>
          </Row>

          <Card title="快速入口" style={{ marginTop: 24 }}>
            <Space wrap>
              <Button onClick={() => window.open(`${omBase}/settings/services/databases`, "_blank")}>配置数据库服务</Button>
              <Button onClick={() => window.open(`${omBase}/settings/services/pipelines`, "_blank")}>配置管道服务</Button>
              <Button onClick={() => window.open(`${omBase}/glossary`, "_blank")}>术语表</Button>
              <Button onClick={() => window.open(`${omBase}/tags`, "_blank")}>标签管理</Button>
              <Button onClick={() => window.open(`${omBase}/settings`, "_blank")}>系统设置</Button>
            </Space>
          </Card>
        </>
      )}
    </div>
  );
}
