"use client";

import React, { useEffect, useState } from "react";
import { Button, Card, Descriptions, Space, Table, Tabs, Tag, Spin, message, Badge } from "antd";
import { ArrowLeftOutlined, PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined, FileTextOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";

const channelLabel: Record<string, string> = { "zero-etl": "Zero-ETL", glue: "Glue ETL", dms: "DMS CDC" };
const statusBadge: Record<string, any> = { draft: "default", running: "processing", stopped: "warning", error: "error", active: "success" };

export default function SyncDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<any>(null);
  const [runs, setRuns] = useState<any>({ runs: [], stats: {} });
  const [loading, setLoading] = useState(true);

  const fetchTask = async () => {
    const res = await fetch(`/api/sync/${id}`);
    const d = await res.json();
    setTask(d.success ? d.data : d);
  };

  const fetchRuns = async () => {
    const res = await fetch(`/api/sync/${id}/runs`);
    const d = await res.json();
    setRuns(d.success ? d.data : d);
  };

  useEffect(() => { Promise.all([fetchTask(), fetchRuns()]).finally(() => setLoading(false)); }, [id]);

  const handleToggle = async () => {
    const action = task.status === "running" ? "stop" : "start";
    await fetch(`/api/sync/${id}/${action}`, { method: "POST" });
    message.success(action === "start" ? "已启动" : "已停止");
    fetchTask();
  };

  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (!task) return <div>任务不存在</div>;

  const runColumns = [
    { title: "#", key: "idx", render: (_: any, __: any, i: number) => runs.runs.length - i },
    { title: "开始时间", dataIndex: "startedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    { title: "耗时", dataIndex: "duration", render: (v: number) => v ? `${Math.floor(v / 60)}m${v % 60}s` : "-" },
    { title: "读取行数", key: "read", render: (_: any, r: any) => r.metrics?.rowsRead?.toLocaleString() || "-" },
    { title: "写入行数", key: "write", render: (_: any, r: any) => r.metrics?.rowsWritten?.toLocaleString() || "-" },
    { title: "触发方式", dataIndex: "triggeredBy", render: (v: string) => v === "schedule" ? "定时" : v === "manual" ? "手动" : v || "-" },
    { title: "状态", dataIndex: "status", render: (v: string) => <Badge status={statusBadge[v] || "default"} text={v === "succeeded" ? "成功" : v === "failed" ? "失败" : v === "running" ? "运行中" : v} /> },
    { title: "错误", dataIndex: "error", ellipsis: true, render: (v: string) => v ? <Tag color="red">{v.slice(0, 60)}</Tag> : "-" },
  ];

  const mappingData = task.fieldMappings ? Object.entries(task.fieldMappings).flatMap(([table, fields]: [string, any]) =>
    (fields || []).map((f: any, i: number) => ({ key: `${table}-${i}`, table, ...f }))
  ) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/sync")}>返回</Button>
          <h2 style={{ margin: 0 }}>{task.name}</h2>
          <Badge status={statusBadge[task.status] || "default"} text={task.status} />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchTask(); fetchRuns(); }}>刷新</Button>
          <Button icon={task.status === "running" ? <PauseCircleOutlined /> : <PlayCircleOutlined />} type="primary" onClick={handleToggle}>
            {task.status === "running" ? "停止" : "启动"}
          </Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="通道">{channelLabel[task.channel] || task.channel}</Descriptions.Item>
          <Descriptions.Item label="模式">{task.syncMode === "full" ? "全量" : "增量"} / {task.writeMode}</Descriptions.Item>
          <Descriptions.Item label="目标">{task.targetType?.toUpperCase()}</Descriptions.Item>
          <Descriptions.Item label="调度">{task.cronExpression || "未配置"}</Descriptions.Item>
          <Descriptions.Item label="数据源">{task.datasourceId?.slice(-8)}</Descriptions.Item>
          <Descriptions.Item label="源库">{task.sourceDatabase}</Descriptions.Item>
          <Descriptions.Item label="源表">{task.sourceTables?.join(", ")}</Descriptions.Item>
          <Descriptions.Item label="Glue Job">{task.glueJobName || "-"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size={48}>
          <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{runs.stats?.total || 0}</div><div style={{ color: "#888" }}>总运行次数</div></div>
          <div><div style={{ fontSize: 24, fontWeight: "bold", color: "#52c41a" }}>{runs.stats?.successRate ? (runs.stats.successRate * 100).toFixed(0) + "%" : "N/A"}</div><div style={{ color: "#888" }}>成功率</div></div>
          <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{runs.stats?.avgDuration ? Math.round(runs.stats.avgDuration) + "s" : "N/A"}</div><div style={{ color: "#888" }}>平均耗时</div></div>
          <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{runs.stats?.totalRows?.toLocaleString() || 0}</div><div style={{ color: "#888" }}>累计同步行数</div></div>
        </Space>
      </Card>

      <Tabs items={[
        { key: "runs", label: `运行历史 (${runs.runs?.length || 0})`, children: <Table columns={runColumns} dataSource={runs.runs} rowKey="runId" size="small" pagination={{ pageSize: 20 }} /> },
        { key: "mapping", label: "字段映射", children: (
          <Table size="small" dataSource={mappingData} pagination={false} columns={[
            { title: "表", dataIndex: "table", render: (v: string) => <b>{v}</b> },
            { title: "源字段", dataIndex: "source", render: (v: string) => <code>{v}</code> },
            { title: "源类型", dataIndex: "sourceType", render: (v: string) => <Tag>{v}</Tag> },
            { title: "→", width: 30, render: () => "→" },
            { title: "目标字段", dataIndex: "target", render: (v: string) => <code>{v}</code> },
            { title: "目标类型", dataIndex: "targetType", render: (v: string) => <Tag color="blue">{v}</Tag> },
          ]} />
        )},
        { key: "config", label: "完整配置", children: (
          <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, fontSize: 12, maxHeight: 400, overflow: "auto" }}>
            {JSON.stringify(task, null, 2)}
          </pre>
        )},
      ]} />
    </div>
  );
}
