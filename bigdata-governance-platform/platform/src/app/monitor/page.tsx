"use client";

import React, { useEffect, useState, useRef } from "react";
import { Card, Col, Row, Statistic, Table, Tag, Tabs, Modal, Button, Space, Select, Badge, Input, Form, Switch, message } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined, FileTextOutlined, ReloadOutlined, BellOutlined, PlusOutlined } from "@ant-design/icons";

export default function MonitorPage() {
  const [syncTasks, setSyncTasks] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logModal, setLogModal] = useState<{ open: boolean; id: string; logs: any[] }>({ open: false, id: "", logs: [] });
  const [refreshInterval, setRefreshInterval] = useState(10);
  const timerRef = useRef<NodeJS.Timeout>(undefined);
  const [alertModal, setAlertModal] = useState(false);
  const [alertForm] = Form.useForm();

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/sync").then((r) => r.json()).then((d) => d.success ? d.data : d),
      fetch("/api/workflow").then((r) => r.json()).then((d) => d.success ? d.data : d),
    ]).then(([s, w]) => { setSyncTasks(s); setWorkflows(w); }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) timerRef.current = setInterval(fetchData, refreshInterval * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval]);

  const count = (items: any[], status: string) => items.filter((i) => i.status === status).length;

  const viewLogs = async (id: string) => {
    const res = await fetch(`/api/monitor/tasks/${id}/logs`);
    const data = await res.json();
    setLogModal({ open: true, id, logs: data.logs || [] });
  };

  const statusRender = (v: string) => {
    const m: Record<string, { s: any; t: string }> = {
      running: { s: "processing", t: "运行中" }, active: { s: "success", t: "运行中" },
      draft: { s: "default", t: "草稿" }, stopped: { s: "warning", t: "已停止" },
      paused: { s: "warning", t: "已暂停" }, error: { s: "error", t: "异常" }, testing: { s: "processing", t: "测试中" },
    };
    const st = m[v] || { s: "default", t: v };
    return <Badge status={st.s} text={st.t} />;
  };

  const taskColumns = [
    { title: "名称", dataIndex: "name", key: "name", render: (v: string) => <b>{v}</b> },
    { title: "类型", key: "type", render: (_: any, r: any) => <Tag color={r.taskId ? "blue" : "purple"}>{r.taskId ? "同步" : "工作流"}</Tag> },
    { title: "状态", dataIndex: "status", key: "status", render: statusRender },
    { title: "调度", key: "cron", render: (_: any, r: any) => r.cronExpression ? <Tag><ClockCircleOutlined /> {r.cronExpression}</Tag> : <Tag>未配置</Tag> },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    { title: "操作", key: "action", render: (_: any, r: any) => (
      <Button size="small" icon={<FileTextOutlined />} onClick={() => viewLogs(r.taskId || r.workflowId)}>日志</Button>
    )},
  ];

  const allTasks = [
    ...syncTasks.map((t) => ({ ...t, key: t.taskId })),
    ...workflows.map((w) => ({ ...w, key: w.workflowId })),
  ];
  const errorTasks = allTasks.filter((t) => t.status === "error");
  const runningCount = count(syncTasks, "running") + count(workflows, "active");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>任务监控</h2>
        <Space>
          <Select value={refreshInterval} onChange={setRefreshInterval} style={{ width: 130 }} options={[
            { label: "手动刷新", value: 0 }, { label: "5秒自动", value: 5 }, { label: "10秒自动", value: 10 }, { label: "30秒自动", value: 30 },
          ]} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button icon={<BellOutlined />} onClick={() => setAlertModal(true)}>告警规则</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="运行中" value={runningCount} prefix={<SyncOutlined spin={runningCount > 0} />} valueStyle={{ color: "#1677ff" }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已完成" value={count(syncTasks, "stopped") + count(workflows, "paused")} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} /></Card></Col>
        <Col span={6}><Card><Statistic title="异常" value={errorTasks.length} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#ff4d4f" }} /></Card></Col>
        <Col span={6}><Card><Statistic title="总任务" value={allTasks.length} prefix={<ClockCircleOutlined />} /></Card></Col>
      </Row>

      <Tabs items={[
        { key: "all", label: `全部 (${allTasks.length})`, children: <Table columns={taskColumns} dataSource={allTasks} loading={loading} pagination={{ pageSize: 20 }} /> },
        { key: "errors", label: <span style={{ color: errorTasks.length > 0 ? "#ff4d4f" : undefined }}>异常告警 ({errorTasks.length})</span>, children: <Table columns={taskColumns} dataSource={errorTasks} loading={loading} /> },
        { key: "sync", label: `同步 (${syncTasks.length})`, children: <Table columns={taskColumns} dataSource={syncTasks.map((t) => ({ ...t, key: t.taskId }))} loading={loading} /> },
        { key: "workflow", label: `工作流 (${workflows.length})`, children: <Table columns={taskColumns} dataSource={workflows.map((w) => ({ ...w, key: w.workflowId }))} loading={loading} /> },
      ]} />

      <Modal title={`日志 - ${logModal.id?.slice(-8)}`} open={logModal.open} onCancel={() => setLogModal({ open: false, id: "", logs: [] })} footer={null} width={800}>
        <div style={{ maxHeight: 400, overflow: "auto", background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}>
          {logModal.logs.length > 0 ? logModal.logs.map((log, i) => (
            <div key={i}><span style={{ color: "#6a9955" }}>{new Date(log.timestamp).toISOString()}</span> {log.message}</div>
          )) : <span style={{ color: "#808080" }}>暂无日志</span>}
        </div>
      </Modal>

      <Modal title="告警规则配置" open={alertModal} onCancel={() => setAlertModal(false)} onOk={() => { message.success("告警规则已保存"); setAlertModal(false); }} width={600}>
        <Form form={alertForm} layout="vertical">
          <Form.Item name="name" label="规则名称" initialValue="同步任务失败告警"><Input /></Form.Item>
          <Form.Item name="condition" label="触发条件" initialValue="task_failed">
            <Select options={[
              { label: "任务执行失败", value: "task_failed" },
              { label: "任务执行超时", value: "task_timeout" },
              { label: "数据量异常", value: "row_count_anomaly" },
            ]} />
          </Form.Item>
          <Form.Item name="scope" label="适用范围" initialValue="all">
            <Select options={[{ label: "所有任务", value: "all" }, { label: "仅同步任务", value: "sync" }, { label: "仅工作流", value: "workflow" }]} />
          </Form.Item>
          <Form.Item name="channels" label="通知渠道">
            <Select mode="multiple" placeholder="选择通知渠道" options={[
              { label: "📧 邮件 (SNS)", value: "email" },
              { label: "💬 企业微信 Webhook", value: "wechat" },
              { label: "🔔 钉钉 Webhook", value: "dingtalk" },
            ]} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
