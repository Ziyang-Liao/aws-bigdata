"use client";

import React, { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Table, Tag, Tabs } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined } from "@ant-design/icons";

export default function MonitorPage() {
  const [syncTasks, setSyncTasks] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/sync").then((r) => r.json()),
      fetch("/api/workflow").then((r) => r.json()),
    ]).then(([s, w]) => { setSyncTasks(s); setWorkflows(w); }).finally(() => setLoading(false));
  }, []);

  const count = (items: any[], status: string) => items.filter((i) => i.status === status).length;

  const taskColumns = [
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "类型", key: "type", render: (_: any, r: any) => r.taskId ? "同步任务" : "工作流" },
    {
      title: "状态", dataIndex: "status", key: "status",
      render: (v: string) => {
        const m: Record<string, { color: string; text: string }> = {
          running: { color: "processing", text: "运行中" },
          active: { color: "success", text: "运行中" },
          draft: { color: "default", text: "草稿" },
          stopped: { color: "warning", text: "已停止" },
          paused: { color: "warning", text: "已暂停" },
          error: { color: "error", text: "异常" },
        };
        return <Tag color={m[v]?.color}>{m[v]?.text || v}</Tag>;
      },
    },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
  ];

  const allTasks = [
    ...syncTasks.map((t) => ({ ...t, key: t.taskId })),
    ...workflows.map((w) => ({ ...w, key: w.workflowId })),
  ];

  return (
    <div>
      <h2>任务监控</h2>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card><Statistic title="运行中" value={count(syncTasks, "running") + count(workflows, "active")} prefix={<SyncOutlined spin />} valueStyle={{ color: "#1677ff" }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="已完成" value={count(syncTasks, "stopped") + count(workflows, "paused")} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="异常" value={count(syncTasks, "error") + count(workflows, "error")} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#ff4d4f" }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="草稿" value={count(syncTasks, "draft") + count(workflows, "draft")} prefix={<ClockCircleOutlined />} /></Card>
        </Col>
      </Row>

      <Tabs items={[
        { key: "all", label: "全部任务", children: <Table columns={taskColumns} dataSource={allTasks} loading={loading} pagination={{ pageSize: 20 }} /> },
        { key: "sync", label: "同步任务", children: <Table columns={taskColumns} dataSource={syncTasks.map((t) => ({ ...t, key: t.taskId }))} loading={loading} /> },
        { key: "workflow", label: "工作流", children: <Table columns={taskColumns} dataSource={workflows.map((w) => ({ ...w, key: w.workflowId }))} loading={loading} /> },
      ]} />
    </div>
  );
}
