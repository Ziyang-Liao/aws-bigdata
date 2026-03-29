"use client";

import React, { useEffect, useState } from "react";
import { Table, Switch, Input, message, Tag } from "antd";

export default function SchedulePage() {
  const [syncTasks, setSyncTasks] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/sync").then((r) => r.json()),
      fetch("/api/workflow").then((r) => r.json()),
    ]).then(([s, w]) => { setSyncTasks(s); setWorkflows(w); }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const updateCron = async (type: "sync" | "workflow", id: string, cronExpression: string) => {
    const url = type === "sync" ? `/api/sync/${id}` : `/api/workflow/${id}`;
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cronExpression }) });
    message.success("调度已更新");
    fetchData();
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    await fetch(`/api/workflow/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleEnabled: enabled }) });
    message.success(enabled ? "已启用" : "已暂停");
    fetchData();
  };

  const allItems = [
    ...syncTasks.map((t) => ({ ...t, key: t.taskId, itemId: t.taskId, itemType: "sync" as const, itemName: t.name })),
    ...workflows.map((w) => ({ ...w, key: w.workflowId, itemId: w.workflowId, itemType: "workflow" as const, itemName: w.name })),
  ];

  const columns = [
    { title: "名称", dataIndex: "itemName", key: "name" },
    { title: "类型", dataIndex: "itemType", key: "type", render: (v: string) => <Tag>{v === "sync" ? "同步任务" : "工作流"}</Tag> },
    {
      title: "Cron 表达式", key: "cron",
      render: (_: any, r: any) => (
        <Input
          size="small"
          style={{ width: 200 }}
          defaultValue={r.cronExpression || ""}
          placeholder="0 0 * * *"
          onBlur={(e) => updateCron(r.itemType, r.itemId, e.target.value)}
        />
      ),
    },
    {
      title: "启用", key: "enabled",
      render: (_: any, r: any) => r.itemType === "workflow" ? (
        <Switch checked={r.scheduleEnabled} onChange={(v) => toggleSchedule(r.itemId, v)} />
      ) : <span>-</span>,
    },
    { title: "状态", dataIndex: "status", key: "status" },
  ];

  return (
    <div>
      <h2>调度管理</h2>
      <Table columns={columns} dataSource={allItems} loading={loading} />
    </div>
  );
}
