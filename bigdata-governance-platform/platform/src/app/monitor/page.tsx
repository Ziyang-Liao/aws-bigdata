"use client";

import React, { useEffect, useState, useRef } from "react";
import { Card, Col, Row, Statistic, Table, Tag, Tabs, Modal, Button, Space, Select, Badge, Input, DatePicker, message } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined, FileTextOutlined, ReloadOutlined, RedoOutlined, FieldTimeOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

export default function MonitorPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [logModal, setLogModal] = useState<{ open: boolean; taskId: string; runId: string; logs: any[] }>({ open: false, taskId: "", runId: "", logs: [] });
  const [refreshInterval, setRefreshInterval] = useState(10);
  const timerRef = useRef<NodeJS.Timeout>(undefined);
  const [filters, setFilters] = useState({ name: "", status: "", taskType: "", triggeredBy: "", startDate: "", endDate: "" });

  const buildQuery = (f: typeof filters) => {
    const params = new URLSearchParams();
    if (f.name) params.set("name", f.name);
    if (f.status) params.set("status", f.status);
    if (f.taskType) params.set("taskType", f.taskType);
    if (f.triggeredBy) params.set("triggeredBy", f.triggeredBy);
    if (f.startDate) params.set("startDate", f.startDate);
    if (f.endDate) params.set("endDate", f.endDate);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const fetchData = (f?: typeof filters) => {
    setLoading(true);
    fetch(`/api/monitor/runs${buildQuery(f || filters)}`).then((r) => r.json()).then((d) => {
      setRuns(d.runs || []);
      setStats(d.stats || {});
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) timerRef.current = setInterval(() => fetchData(), refreshInterval * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval, filters]);

  const onSearch = () => fetchData(filters);
  const onReset = () => { const f = { name: "", status: "", taskType: "", triggeredBy: "", startDate: "", endDate: "" }; setFilters(f); fetchData(f); };

  const viewLog = async (taskId: string, runId: string) => {
    setLogModal({ open: true, taskId, runId, logs: [] });
    const res = await fetch(`/api/monitor/tasks/${taskId}/logs?runId=${encodeURIComponent(runId)}`);
    const data = await res.json();
    setLogModal({ open: true, taskId, runId, logs: data.logs || [] });
  };

  const retryTask = async (taskId: string, taskType: string) => {
    const url = taskType === "workflow" ? `/api/workflow/${taskId}/trigger` : `/api/sync/${taskId}/start`;
    const res = await fetch(url, { method: "POST" });
    const d = await res.json();
    d.success !== false ? message.success("已重新触发") : message.error(d.error?.message || "触发失败");
    fetchData();
  };

  const statusBadge = (v: string) => {
    const m: Record<string, { s: any; t: string }> = {
      succeeded: { s: "success", t: "成功" }, failed: { s: "error", t: "失败" }, running: { s: "processing", t: "运行中" },
    };
    const st = m[v] || { s: "default", t: v };
    return <Badge status={st.s} text={st.t} />;
  };

  const columns = [
    { title: "时间", dataIndex: "startedAt", key: "time", width: 170,
      render: (v: string, r: any) => (v || r.finishedAt || "").slice(0, 19).replace("T", " ") || "-" },
    { title: "任务名", dataIndex: "taskName", key: "name",
      render: (v: string, r: any) => <a href={r.taskType === "workflow" ? `/workflow/${r.taskId}` : `/sync/${r.taskId}`}><b>{v}</b></a> },
    { title: "类型", dataIndex: "taskType", key: "type", width: 90,
      render: (v: string) => <Tag color={v === "sync" ? "blue" : "purple"}>{v === "sync" ? "同步" : "工作流"}</Tag> },
    { title: "触发", dataIndex: "triggeredBy", key: "trigger", width: 80,
      render: (v: string) => v === "schedule" ? <Tag color="green">自动</Tag> : <Tag>手动</Tag> },
    { title: "状态", dataIndex: "status", key: "status", width: 100, render: statusBadge },
    { title: "耗时", dataIndex: "duration", key: "duration", width: 80,
      render: (v: number) => v ? (v >= 60 ? `${Math.floor(v / 60)}m${v % 60}s` : `${v}s`) : "-" },
    { title: "错误", dataIndex: "error", key: "error", ellipsis: true,
      render: (v: string) => v ? <span style={{ color: "#ff4d4f" }}>{v}</span> : "-" },
    { title: "操作", key: "action", width: 140,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<FileTextOutlined />} onClick={() => viewLog(r.taskId, r.runId)}>日志</Button>
          {r.status === "failed" && <Button size="small" type="link" danger icon={<RedoOutlined />} onClick={() => retryTask(r.taskId, r.taskType)}>重试</Button>}
        </Space>
      ),
    },
  ];

  const runningRuns = runs.filter((r) => r.status === "running");
  const failedRuns = runs.filter((r) => r.status === "failed");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayRuns = runs.filter((r) => (r.startedAt || r.finishedAt || "") >= todayStart);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>任务监控</h2>
        <Space>
          <Select value={refreshInterval} onChange={setRefreshInterval} style={{ width: 130 }} options={[
            { label: "手动刷新", value: 0 }, { label: "5秒自动", value: 5 }, { label: "10秒自动", value: 10 }, { label: "30秒自动", value: 30 },
          ]} />
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}><Card size="small"><Statistic title="运行中" value={stats.running || 0} prefix={<SyncOutlined spin={(stats.running || 0) > 0} />} valueStyle={{ color: "#1677ff" }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="今日成功" value={stats.todaySuccess || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="今日失败" value={stats.todayFailed || 0} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#ff4d4f" }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="今日运行" value={stats.todayTotal || 0} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="成功率" value={stats.successRate || 0} suffix="%" valueStyle={{ color: (stats.successRate || 0) >= 90 ? "#52c41a" : "#faad14" }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="平均耗时" value={stats.avgDuration || 0} suffix="s" prefix={<FieldTimeOutlined />} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="任务名称" prefix={<SearchOutlined />} value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} onPressEnter={onSearch} style={{ width: 180 }} allowClear />
          <Select placeholder="状态" value={filters.status || undefined} onChange={(v) => { const f = { ...filters, status: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 110 }}
            options={[{ label: "成功", value: "succeeded" }, { label: "失败", value: "failed" }, { label: "运行中", value: "running" }]} />
          <Select placeholder="任务类型" value={filters.taskType || undefined} onChange={(v) => { const f = { ...filters, taskType: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "同步", value: "sync" }, { label: "工作流", value: "workflow" }]} />
          <Select placeholder="触发方式" value={filters.triggeredBy || undefined} onChange={(v) => { const f = { ...filters, triggeredBy: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "自动", value: "schedule" }, { label: "手动", value: "manual" }]} />
          <DatePicker.RangePicker size="middle" allowClear
            onChange={(dates) => {
              const f = { ...filters, startDate: dates?.[0]?.format("YYYY-MM-DD") || "", endDate: dates?.[1]?.format("YYYY-MM-DD") || "" };
              setFilters(f); fetchData(f);
            }} />
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>搜索</Button>
          <Button onClick={onReset}>重置</Button>
        </Space>
      </Card>

      <Tabs items={[
        { key: "all", label: `全部运行 (${runs.length})`,
          children: <Table columns={columns} dataSource={runs} rowKey={(r) => `${r.taskId}-${r.runId}`} loading={loading} pagination={{ pageSize: 20 }} size="small" /> },
        { key: "running", label: <span style={{ color: runningRuns.length > 0 ? "#1677ff" : undefined }}>运行中 ({runningRuns.length})</span>,
          children: <Table columns={columns} dataSource={runningRuns} rowKey={(r) => `${r.taskId}-${r.runId}`} loading={loading} size="small" /> },
        { key: "failed", label: <span style={{ color: failedRuns.length > 0 ? "#ff4d4f" : undefined }}>失败 ({failedRuns.length})</span>,
          children: <Table columns={columns} dataSource={failedRuns} rowKey={(r) => `${r.taskId}-${r.runId}`} loading={loading} size="small" /> },
        { key: "today", label: `今日 (${todayRuns.length})`,
          children: <Table columns={columns} dataSource={todayRuns} rowKey={(r) => `${r.taskId}-${r.runId}`} loading={loading} pagination={{ pageSize: 20 }} size="small" /> },
      ]} />

      <Modal title="运行日志" open={logModal.open} onCancel={() => setLogModal({ open: false, taskId: "", runId: "", logs: [] })} footer={null} width={900}>
        <div style={{ maxHeight: 500, overflow: "auto", background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
          {logModal.logs.length > 0 ? logModal.logs.map((log, i) => (
            <div key={i}>{log.timestamp ? <span style={{ color: "#6a9955" }}>{new Date(log.timestamp).toISOString().slice(0, 19)} </span> : null}{typeof log === "string" ? log : log.message}</div>
          )) : <span style={{ color: "#808080" }}>暂无日志</span>}
        </div>
      </Modal>
    </div>
  );
}
