"use client";

import React, { useEffect, useState } from "react";
import { Card, Descriptions, Tag, Button, Space, Spin } from "antd";
import { SettingOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from "@ant-design/icons";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = async () => {
    const res = await fetch("/api/settings");
    const d = await res.json();
    setConfig(d.success ? d.data : d);
  };

  const checkHealth = async () => {
    setLoading(true);
    const checks: Record<string, any> = {};

    try {
      const res = await fetch("/api/datasources");
      checks.dynamodb = { status: res.ok ? "ok" : "error", message: res.ok ? "正常" : `HTTP ${res.status}` };
    } catch (e: any) { checks.dynamodb = { status: "error", message: e.message }; }

    try {
      const res = await fetch("/api/redshift/connections");
      const d = await res.json();
      const list = Array.isArray(d) ? d : d.data || [];
      checks.redshift = { status: list.length > 0 ? "ok" : "warning", message: `${list.length} 个 Workgroup` };
    } catch (e: any) { checks.redshift = { status: "error", message: e.message }; }

    try {
      const res = await fetch("/api/s3/buckets");
      const d = await res.json();
      const buckets = d.success ? d.data : d;
      checks.s3 = { status: "ok", message: `${Array.isArray(buckets) ? buckets.length : 0} 个 Bucket` };
    } catch (e: any) { checks.s3 = { status: "error", message: e.message }; }

    try {
      const res = await fetch("/api/admin/users");
      const d = await res.json();
      const users = d.success ? d.data : [];
      checks.cognito = { status: users.length > 0 ? "ok" : "warning", message: users.length > 0 ? `${users.length} 个用户` : "已配置" };
    } catch { checks.cognito = { status: "warning", message: "检查中..." }; }

    setHealth(checks);
    setLoading(false);
  };

  useEffect(() => { fetchConfig(); checkHealth(); }, []);

  const statusIcon = (s: string) => s === "ok" ? <CheckCircleOutlined style={{ color: "#52c41a" }} /> : s === "warning" ? <WarningOutlined style={{ color: "#faad14" }} /> : <CloseCircleOutlined style={{ color: "#ff4d4f" }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><SettingOutlined /> 系统设置</h2>
        <Button icon={<ReloadOutlined />} onClick={checkHealth} loading={loading}>刷新状态</Button>
      </div>

      <Card title="平台配置" size="small" style={{ marginBottom: 16 }}>
        {config ? (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="AWS Region">{config.region}</Descriptions.Item>
            <Descriptions.Item label="Cognito User Pool">{config.cognitoUserPoolId}</Descriptions.Item>
            <Descriptions.Item label="Redshift Workgroup">{config.redshiftWorkgroup}</Descriptions.Item>
            <Descriptions.Item label="Glue 脚本 Bucket">{config.glueScriptsBucket}</Descriptions.Item>
            <Descriptions.Item label="Glue IAM Role">{config.glueRoleArn?.split("/").pop()}</Descriptions.Item>
            <Descriptions.Item label="MWAA DAG Bucket">{config.mwaaDagBucket}</Descriptions.Item>
            <Descriptions.Item label="默认 VPC">{config.defaultVpcId}</Descriptions.Item>
          </Descriptions>
        ) : <Spin />}
      </Card>

      <Card title="服务状态" size="small">
        {health ? (
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
        ) : <Spin />}
      </Card>
    </div>
  );
}
