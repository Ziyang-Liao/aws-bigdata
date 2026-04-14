"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Popconfirm, message, Select, Input, Card } from "antd";
import { PlusOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined, SearchOutlined } from "@ant-design/icons";
import type { SyncTask } from "@/types/sync-task";
import { useRouter } from "next/navigation";
import SyncTaskModal from "./SyncTaskModal";

const statusMap: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  running: { color: "processing", text: "运行中" },
  stopped: { color: "warning", text: "已停止" },
  error: { color: "error", text: "异常" },
};

const channelLabel: Record<string, string> = { "zero-etl": "Zero-ETL", glue: "Glue ETL", dms: "DMS CDC" };

export default function SyncPage() {
  const [data, setData] = useState<SyncTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SyncTask | undefined>();
  const router = useRouter();
  const [filters, setFilters] = useState({ name: "", channel: "", syncMode: "", targetType: "", status: "" });

  const fetchData = async (f?: typeof filters) => {
    setLoading(true);
    try {
      const cur = f || filters;
      const params = new URLSearchParams();
      if (cur.name) params.set("name", cur.name);
      if (cur.channel) params.set("channel", cur.channel);
      if (cur.syncMode) params.set("syncMode", cur.syncMode);
      if (cur.targetType) params.set("targetType", cur.targetType);
      if (cur.status) params.set("status", cur.status);
      const qs = params.toString();
      const res = await fetch(`/api/sync${qs ? `?${qs}` : ""}`);
      const d = await res.json();
      setData(d.success ? d.data : d);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/sync/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchData();
  };

  const handleToggle = async (id: string, status: string) => {
    const action = status === "running" ? "stop" : "start";
    const res = await fetch(`/api/sync/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    if (data.success === false || data.error) {
      message.error(data.error?.message || data.error || "操作失败");
      return;
    }
    message.success(action === "start" ? "已启动" : "已停止");
    fetchData();
  };

  const columns = [
    { title: "任务名称", dataIndex: "name", key: "name",
      render: (v: string, r: any) => <a href={`/sync/${r.taskId}`}><b>{v}</b></a> },
    { title: "同步通道", dataIndex: "channel", key: "channel", render: (v: string) => channelLabel[v] || v },
    { title: "同步模式", dataIndex: "syncMode", key: "syncMode", render: (v: string) => v === "full" ? "全量" : "增量" },
    { title: "目标", dataIndex: "targetType", key: "targetType", render: (v: string) => v?.toUpperCase() },
    {
      title: "状态", dataIndex: "status", key: "status",
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>,
    },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    {
      title: "操作", key: "action",
      render: (_: any, record: SyncTask) => (
        <Space>
          <a onClick={() => handleToggle(record.taskId, record.status)}>
            {record.status === "running" ? <><PauseCircleOutlined /> 停止</> : <><PlayCircleOutlined /> 启动</>}
          </a>
          <a onClick={() => router.push(`/sync/${record.taskId}`)}>详情</a>
          <a onClick={() => { setEditing(record); setModalOpen(true); }}>编辑</a>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.taskId)}>
            <a style={{ color: "red" }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>数据同步</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setModalOpen(true); }}>
            新建同步任务
          </Button>
        </Space>
      </div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="任务名称" prefix={<SearchOutlined />} value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} onPressEnter={() => fetchData()} allowClear style={{ width: 180 }} />
          <Select placeholder="同步通道" value={filters.channel || undefined} onChange={(v) => { const f = { ...filters, channel: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 130 }}
            options={[{ label: "Glue ETL", value: "glue" }, { label: "Zero-ETL", value: "zero-etl" }, { label: "DMS CDC", value: "dms" }]} />
          <Select placeholder="同步模式" value={filters.syncMode || undefined} onChange={(v) => { const f = { ...filters, syncMode: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "全量", value: "full" }, { label: "增量", value: "incremental" }]} />
          <Select placeholder="目标" value={filters.targetType || undefined} onChange={(v) => { const f = { ...filters, targetType: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 140 }}
            options={[{ label: "S3 数据湖", value: "s3-tables" }, { label: "Redshift", value: "redshift" }, { label: "S3 + Redshift", value: "both" }]} />
          <Select placeholder="状态" value={filters.status || undefined} onChange={(v) => { const f = { ...filters, status: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 110 }}
            options={[{ label: "草稿", value: "draft" }, { label: "运行中", value: "running" }, { label: "已停止", value: "stopped" }, { label: "异常", value: "error" }]} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData()}>搜索</Button>
          <Button onClick={() => { const f = { name: "", channel: "", syncMode: "", targetType: "", status: "" }; setFilters(f); fetchData(f); }}>重置</Button>
        </Space>
      </Card>
      <Table columns={columns} dataSource={data} rowKey="taskId" loading={loading} />
      <SyncTaskModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData(); }} />
    </div>
  );
}
