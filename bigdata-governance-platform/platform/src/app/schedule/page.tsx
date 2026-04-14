"use client";

import React, { useEffect, useState, useRef } from "react";
import { Table, Switch, Tag, message, Modal, Button, Space, Select, Badge, Input, Card } from "antd";
import { ReloadOutlined, ClockCircleOutlined, HistoryOutlined, SearchOutlined } from "@ant-design/icons";
import CronEditor from "@/components/common/CronEditor";

export default function SchedulePage() {
  const [syncTasks, setSyncTasks] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cronModal, setCronModal] = useState<{ open: boolean; item?: any; cron: string }>({ open: false, cron: "" });
  const [runRecords, setRunRecords] = useState<Record<string, any[]>>({});
  const [logModal, setLogModal] = useState<{ open: boolean; id: string; logs: any[] }>({ open: false, id: "", logs: [] });

  const fetchRuns = async (id: string) => {
    const res = await fetch(`/api/sync/${id}/runs`);
    const d = await res.json();
    const runs = d.data?.runs || d.runs || d.Items || [];
    setRunRecords((prev) => ({ ...prev, [id]: runs }));
  };

  const viewLog = async (id: string, runId?: string) => {
    setLogModal({ open: true, id, logs: [] });
    const url = runId ? `/api/monitor/tasks/${id}/logs?runId=${encodeURIComponent(runId)}` : `/api/monitor/tasks/${id}/logs`;
    const res = await fetch(url);
    const data = await res.json();
    setLogModal({ open: true, id, logs: data.logs || [] });
  };
  const [refreshInterval, setRefreshInterval] = useState(0);
  const timerRef = useRef<NodeJS.Timeout>(undefined);
  const [filters, setFilters] = useState({ name: "", itemType: "", status: "", enabled: "", scheduleType: "" });

  const buildQs = (f: typeof filters, type: string) => {
    const params = new URLSearchParams();
    if (f.name) params.set("name", f.name);
    if (f.status) params.set("status", f.status);
    if (f.enabled === "true") params.set("scheduleEnabled", "true");
    else if (f.enabled === "false") params.set("scheduleEnabled", "false");
    // scheduleType maps to cron param for workflow API
    if (f.scheduleType === "auto") params.set("cron", "configured");
    else if (f.scheduleType === "manual") params.set("cron", "none");
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const fetchData = (f?: typeof filters) => {
    const cur = f || filters;
    const skip = cur.itemType;
    setLoading(true);
    Promise.all([
      skip === "workflow" ? Promise.resolve([]) : fetch(`/api/sync${buildQs(cur, "sync")}`).then((r) => r.json()).then((d) => d.success ? d.data : d),
      skip === "sync" ? Promise.resolve([]) : fetch(`/api/workflow${buildQs(cur, "workflow")}`).then((r) => r.json()).then((d) => d.success ? d.data : d),
    ]).then(([s, w]) => { setSyncTasks(s); setWorkflows(w); }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) timerRef.current = setInterval(() => fetchData(), refreshInterval * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval, filters]);

  const saveCron = async () => {
    const item = cronModal.item;
    if (!item) return;
    // If schedule is already enabled, update cron via schedule/enable to regenerate DAG
    if (item.scheduleEnabled) {
      const res = await fetch("/api/schedule/enable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: item.itemId, taskType: item.itemType, cronExpression: cronModal.cron, enabled: true }),
      });
      const d = await res.json();
      d.success !== false ? message.success("调度已更新") : message.error(d.error?.message || "更新失败");
    } else {
      const url = item.itemType === "sync" ? `/api/sync/${item.itemId}` : `/api/workflow/${item.itemId}`;
      await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cronExpression: cronModal.cron }) });
      message.success("Cron 已保存，启用调度后生效");
    }
    setCronModal({ open: false, cron: "" });
    fetchData();
  };

  const toggleSchedule = async (id: string, type: string, enabled: boolean, cron: string) => {
    const res = await fetch("/api/schedule/enable", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: id, taskType: type, cronExpression: cron || "0 2 * * *", enabled }),
    });
    const d = await res.json();
    if (d.success !== false) {
      message.success(enabled ? "调度已启用 (EventBridge Scheduler)" : "调度已停用");
    } else {
      message.error(d.error?.message || "调度配置失败");
    }
    fetchData();
  };

  const allItems = [
    ...syncTasks.map((t) => ({ ...t, key: t.taskId, itemId: t.taskId, itemType: "sync", itemName: t.name })),
    ...workflows.map((w) => ({ ...w, key: w.workflowId, itemId: w.workflowId, itemType: "workflow", itemName: w.name })),
  ];

  const columns = [
    { title: "名称", dataIndex: "itemName", key: "name",
      render: (v: string, r: any) => <a href={r.itemType === "workflow" ? `/workflow/${r.itemId}` : `/sync/${r.itemId}`}><b>{v}</b></a> },
    { title: "类型", dataIndex: "itemType", key: "type", render: (v: string) => <Tag color={v === "sync" ? "blue" : "purple"}>{v === "sync" ? "同步任务" : "工作流"}</Tag> },
    { title: "Cron 表达式", key: "cron", render: (_: any, r: any) => (
      <Space>
        <Tag style={{ cursor: "pointer" }} onClick={() => setCronModal({ open: true, item: r, cron: r.cronExpression || "0 2 * * *" })}>
          <ClockCircleOutlined /> {r.cronExpression || "未配置"}
        </Tag>
      </Space>
    )},
    { title: "启用", key: "enabled", render: (_: any, r: any) => (
      <Switch size="small" checked={r.scheduleEnabled} onChange={(v) => toggleSchedule(r.itemId, r.itemType, v, r.cronExpression)} />
    )},
    { title: "调度类型", key: "scheduleType", render: (_: any, r: any) => (
      r.scheduleEnabled && r.cronExpression ? <Tag color="green">自动调度</Tag> : <Tag>手动触发</Tag>
    )},
    { title: "状态", dataIndex: "status", key: "status", render: (v: string) => <Badge status={v === "running" || v === "active" ? "processing" : v === "error" ? "error" : "default"} text={v === "active" ? "已发布" : v} /> },
    { title: "最近运行", key: "lastRun", render: (_: any, r: any) => {
      const s = r.lastRunStatus;
      return s ? <Badge status={s === "succeeded" ? "success" : s === "failed" ? "error" : "processing"} text={s === "succeeded" ? "成功" : s === "failed" ? "失败" : s === "running" ? "运行中" : s} /> : <Tag>未运行</Tag>;
    }},
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><ClockCircleOutlined /> 调度管理</h2>
        <Space>
          <Select value={refreshInterval} onChange={setRefreshInterval} style={{ width: 130 }} options={[
            { label: "手动刷新", value: 0 }, { label: "5秒自动", value: 5 }, { label: "10秒自动", value: 10 }, { label: "30秒自动", value: 30 },
          ]} />
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
        </Space>
      </div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="名称" prefix={<SearchOutlined />} value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} onPressEnter={() => fetchData()} allowClear style={{ width: 180 }} />
          <Select placeholder="类型" value={filters.itemType || undefined} onChange={(v) => { const f = { ...filters, itemType: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "同步任务", value: "sync" }, { label: "工作流", value: "workflow" }]} />
          <Select placeholder="状态" value={filters.status || undefined} onChange={(v) => { const f = { ...filters, status: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "草稿", value: "draft" }, { label: "已发布", value: "active" }, { label: "已停止", value: "stopped" }, { label: "异常", value: "error" }]} />
          <Select placeholder="启用" value={filters.enabled || undefined} onChange={(v) => { const f = { ...filters, enabled: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 110 }}
            options={[{ label: "已启用", value: "true" }, { label: "未启用", value: "false" }]} />
          <Select placeholder="调度类型" value={filters.scheduleType || undefined} onChange={(v) => { const f = { ...filters, scheduleType: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "自动调度", value: "auto" }, { label: "手动触发", value: "manual" }]} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData()}>搜索</Button>
          <Button onClick={() => { const f = { name: "", itemType: "", status: "", enabled: "", scheduleType: "" }; setFilters(f); fetchData(f); }}>重置</Button>
        </Space>
      </Card>
      <Table columns={columns} dataSource={allItems} loading={loading} pagination={{ pageSize: 20 }}
        expandable={{
          expandedRowRender: (record: any) => {
            const runs = runRecords[record.itemId] || [];
            return (
              <Table size="small" dataSource={runs} rowKey="runId" pagination={{ pageSize: 10, size: "small" }}
                locale={{ emptyText: "暂无执行记录" }}
                columns={[
                  { title: "运行ID", dataIndex: "runId", width: 160, render: (v: string) => <code style={{fontSize:11}}>{v?.slice(0,16)}</code> },
                  { title: "状态", dataIndex: "status", width: 90, render: (v: string) => <Badge status={v === "succeeded" ? "success" : v === "failed" ? "error" : v === "running" ? "processing" : "default"} text={v === "succeeded" ? "成功" : v === "failed" ? "失败" : v === "running" ? "运行中" : v} /> },
                  { title: "触发方式", dataIndex: "triggeredBy", width: 90, render: (v: string) => v === "schedule" ? <Tag color="green">自动</Tag> : <Tag>手动</Tag> },
                  { title: "开始时间", dataIndex: "startedAt", width: 170, render: (v: string) => v?.slice(0,19).replace("T"," ") },
                  { title: "结束时间", dataIndex: "finishedAt", width: 170, render: (v: string) => v ? v.slice(0,19).replace("T"," ") : "-" },
                  { title: "耗时", dataIndex: "duration", width: 70, render: (v: number) => v ? `${v}s` : "-" },
                  { title: "错误", dataIndex: "error", ellipsis: true, render: (v: string) => v ? <span style={{color:"#ff4d4f"}}>{v}</span> : "-" },
                  { title: "操作", width: 70, render: (_: any, r: any) => <Button size="small" type="link" onClick={() => viewLog(record.itemId, r.runId)}>日志</Button> },
                ]}
              />
            );
          },
          onExpand: (expanded: boolean, record: any) => { if (expanded) fetchRuns(record.itemId); },
        }}
      />

      <Modal title={`日志 - ${logModal.id?.slice(-8)}`} open={logModal.open} onCancel={() => setLogModal({ open: false, id: "", logs: [] })} footer={null} width={800}>
        <div style={{ maxHeight: 400, overflow: "auto", background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
          {logModal.logs.length > 0 ? logModal.logs.map((log: any, i: number) => (
            <div key={i}>{log.timestamp ? <span style={{ color: "#6a9955" }}>{new Date(log.timestamp).toISOString().slice(0,19)} </span> : null}{typeof log === "string" ? log : log.message}</div>
          )) : <span style={{ color: "#808080" }}>暂无日志</span>}
        </div>
      </Modal>

      <Modal title="配置调度" open={cronModal.open} onOk={saveCron} onCancel={() => setCronModal({ open: false, cron: "" })} width={520}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>{cronModal.item?.itemName}</div>
        <CronEditor value={cronModal.cron} onChange={(c) => setCronModal((prev) => ({ ...prev, cron: c }))} />
      </Modal>
    </div>
  );
}
