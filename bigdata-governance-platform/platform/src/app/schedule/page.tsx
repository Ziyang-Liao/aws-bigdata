"use client";

import React, { useEffect, useState, useRef } from "react";
import { Table, Switch, Tag, message, Modal, Button, Space, Select, Badge } from "antd";
import { ReloadOutlined, ClockCircleOutlined } from "@ant-design/icons";
import CronEditor from "@/components/common/CronEditor";

export default function SchedulePage() {
  const [syncTasks, setSyncTasks] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cronModal, setCronModal] = useState<{ open: boolean; item?: any; cron: string }>({ open: false, cron: "" });
  const [refreshInterval, setRefreshInterval] = useState(0);
  const timerRef = useRef<NodeJS.Timeout>(undefined);

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

  const saveCron = async () => {
    const item = cronModal.item;
    if (!item) return;
    const url = item.itemType === "sync" ? `/api/sync/${item.itemId}` : `/api/workflow/${item.itemId}`;
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cronExpression: cronModal.cron }) });
    message.success("调度已更新");
    setCronModal({ open: false, cron: "" });
    fetchData();
  };

  const toggleSchedule = async (id: string, type: string, enabled: boolean) => {
    const url = type === "sync" ? `/api/sync/${id}` : `/api/workflow/${id}`;
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleEnabled: enabled }) });
    message.success(enabled ? "已启用" : "已暂停");
    fetchData();
  };

  const allItems = [
    ...syncTasks.map((t) => ({ ...t, key: t.taskId, itemId: t.taskId, itemType: "sync", itemName: t.name })),
    ...workflows.map((w) => ({ ...w, key: w.workflowId, itemId: w.workflowId, itemType: "workflow", itemName: w.name })),
  ];

  const columns = [
    { title: "名称", dataIndex: "itemName", key: "name", render: (v: string) => <b>{v}</b> },
    { title: "类型", dataIndex: "itemType", key: "type", render: (v: string) => <Tag color={v === "sync" ? "blue" : "purple"}>{v === "sync" ? "同步任务" : "工作流"}</Tag> },
    { title: "Cron 表达式", key: "cron", render: (_: any, r: any) => (
      <Space>
        <Tag style={{ cursor: "pointer" }} onClick={() => setCronModal({ open: true, item: r, cron: r.cronExpression || "0 2 * * *" })}>
          <ClockCircleOutlined /> {r.cronExpression || "未配置"}
        </Tag>
      </Space>
    )},
    { title: "启用", key: "enabled", render: (_: any, r: any) => (
      <Switch size="small" checked={r.scheduleEnabled} onChange={(v) => toggleSchedule(r.itemId, r.itemType, v)} />
    )},
    { title: "状态", dataIndex: "status", key: "status", render: (v: string) => <Badge status={v === "running" || v === "active" ? "processing" : v === "error" ? "error" : "default"} text={v} /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><ClockCircleOutlined /> 调度管理</h2>
        <Space>
          <Select value={refreshInterval} onChange={setRefreshInterval} style={{ width: 130 }} options={[
            { label: "手动刷新", value: 0 }, { label: "5秒自动", value: 5 }, { label: "10秒自动", value: 10 }, { label: "30秒自动", value: 30 },
          ]} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={allItems} loading={loading} pagination={{ pageSize: 20 }} />

      <Modal title="配置调度" open={cronModal.open} onOk={saveCron} onCancel={() => setCronModal({ open: false, cron: "" })} width={520}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>{cronModal.item?.itemName}</div>
        <CronEditor value={cronModal.cron} onChange={(c) => setCronModal((prev) => ({ ...prev, cron: c }))} />
      </Modal>
    </div>
  );
}
