"use client";

import React, { useEffect, useState } from "react";
import { Card, Descriptions, Tag, Badge, Button, Space, Spin, message } from "antd";
import { SettingOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    const checks: Record<string, any> = {};

    // DynamoDB
    try {
      const res = await fetch("/api/datasources");
      checks.dynamodb = { status: res.ok ? "ok" : "error", message: res.ok ? "正常" : `HTTP ${res.status}` };
    } catch (e: any) { checks.dynamodb = { status: "error", message: e.message }; }

    // Redshift
    try {
      const res = await fetch("/api/redshift/connections");
      const d = await res.json();
      checks.redshift = { status: Array.isArray(d) && d.length > 0 ? "ok" : "warning", message: Array.isArray(d) ? `${d.length} 个 Workgroup` : "无法获取" };
    } catch (e: any) { checks.redshift = { status: "error", message: e.message }; }

    // S3
    try {
      const res = await fetch("/api/s3/buckets");
      const d = await res.json();
      const buckets = d.success ? d.data : d;
      checks.s3 = { status: "ok", message: `${buckets.length} 个 Bucket` };
    } catch (e: any) { checks.s3 = { status: "error", message: e.message }; }

    // Cognito
    checks.cognito = { status: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ? "ok" : "warning", message: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "未配置" };

    setHealth(checks);
    setLoading(false);
  };

  useEffect(() => { checkHealth(); }, []);

  const statusIcon = (s: string) => s === "ok" ? <CheckCircleOutlined style={{ color: "#52c41a" }} /> : s === "warning" ? <CheckCircleOutlined style={{ color: "#faad14" }} /> : <CloseCircleOutlined style={{ color: "#ff4d4f" }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><SettingOutlined /> 系统设置</h2>
        <Button icon={<ReloadOutlined />} onClick={checkHealth} loading={loading}>刷新状态</Button>
      </div>

      <Card title="平台配置" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="AWS Region">{process.env.AWS_REGION || "us-east-1"}</Descriptions.Item>
          <Descriptions.Item label="Cognito User Pool">{process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "未配置"}</Descriptions.Item>
          <Descriptions.Item label="Redshift Workgroup">{process.env.REDSHIFT_WORKGROUP || "bgp-workgroup"}</Descriptions.Item>
          <Descriptions.Item label="Glue 脚本 Bucket">{process.env.GLUE_SCRIPTS_BUCKET || "bgp-glue-scripts-*"}</Descriptions.Item>
          <Descriptions.Item label="数据湖 Bucket">bgp-datalake-*</Descriptions.Item>
          <Descriptions.Item label="MWAA DAG Bucket">{process.env.MWAA_DAG_BUCKET || "bgp-mwaa-dags-*"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="服务状态" size="small">
        {loading ? <Spin /> : health ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            {[
              { key: "dynamodb", label: "DynamoDB", desc: "元数据存储" },
              { key: "redshift", label: "Redshift Serverless", desc: "数据仓库" },
              { key: "s3", label: "S3", desc: "数据湖存储" },
              { key: "cognito", label: "Cognito", desc: "用户认证" },
            ].map((svc) => (
              <div key={svc.key} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", border: "1px solid #f0f0f0", borderRadius: 6 }}>
                <Space>
                  {statusIcon(health[svc.key]?.status)}
                  <div>
                    <div style={{ fontWeight: 500 }}>{svc.label}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{svc.desc}</div>
                  </div>
                </Space>
                <Tag color={health[svc.key]?.status === "ok" ? "green" : health[svc.key]?.status === "warning" ? "orange" : "red"}>
                  {health[svc.key]?.message}
                </Tag>
              </div>
            ))}
          </Space>
        ) : null}
      </Card>
    </div>
  );
}
