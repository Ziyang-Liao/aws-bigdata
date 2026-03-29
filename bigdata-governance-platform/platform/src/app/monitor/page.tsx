"use client";

import React, { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Table, Tag, Tabs, Modal, Button } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined, FileTextOutlined } from "@ant-design/icons";

export default function MonitorPage() {
  const [syncTasks, setSyncTasks] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logModal, setLogModal] = useState<{ open: boolean; id: string; logs: any[] }>({ open: false, id: "", logs: [] });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/sync").then((r) => r.json()),
      fetch("/api/workflow").then((r) => r.json()),
    ]).then(([s, w]) => { setSyncTasks(s); setWorkflows(w); }).finally(() => setLoading(false));
  }, []);

  const count = (items: any[], status: string) => items.filter((i) => i.status === status).length;

  const viewLogs = async (id: string) => {
    const res = await fetch(`/api/monitor/tasks/${id}/logs`);
    const data = await res.json();
    setLogModal({ open: true, id, logs: data.logs || [] });
  };

  const statusRender = (v: string) => {
    const m: Record<string, { color: string; text: string }> = {
      running: { color: "processing", text: "运行中" },
      active: { color: "success", text: "运行中" },
      draft: { color: "default", text: "草稿" },
      stopped: { color: "warning", text: "已停止" },
      paused: { color: "warning", text: "已暂停" },
      error: { color: "error", text: "异常" },
    };
    return <Tag color={m[v]?.color}>{m[v]?.text || v}</Tag>;
  };

  const taskColumns = [
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "类型", key: "type", render: (_: any, r: any) => r.taskId ? "同步任务" : "工作流" },
    { title: "状态", dataIndex: "status", key: "status", render: statusRender },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    {
      title: "操作", key: "action",
      render: (_: any, r: any) => (
        <Button size="small" icon={<FileTextOutlined />} onClick={() => viewLogs(r.taskId || r.workflowId)}>
          日志
        </Button>
      ),
    },
  ];

  const allTasks = [
    ...syncTasks.map((t) => ({ ...t, key: t.taskId })),
    ...workflows.map((w) => ({ ...w, key: w.workflowId })),
  ];

  const errorTasks = allTasks.filter((t) => t.status === "error");

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
        { key: "errors", label: `异常告警 (${errorTasks.length})`, children: <Table columns={taskColumns} dataSource={errorTasks} loading={loading} /> },
        { key: "sync", label: "同步任务", children: <Table columns={taskColumns} dataSource={syncTasks.map((t) => ({ ...t, key: t.taskId }))} loading={loading} /> },
        { key: "workflow", label: "工作流", children: <Table columns={taskColumns} dataSource={workflows.map((w) => ({ ...w, key: w.workflowId }))} loading={loading} /> },
      ]} />

      <Modal title={`日志 - ${logModal.id}`} open={logModal.open} onCancel={() => setLogModal({ open: false, id: "", logs: [] })} footer={null} width={800}>
        <div style={{ maxHeight: 400, overflow: "auto", background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}>
          {logModal.logs.length > 0 ? logModal.logs.map((log, i) => (
            <div key={i}>
              <span style={{ color: "#6a9955" }}>{new Date(log.timestamp).toISOString()}</span>{" "}
              {log.message}
            </div>
          )) : <span style={{ color: "#808080" }}>暂无日志（需部署后查看）</span>}
        </div>
      </Modal>
    </div>
  );
}
