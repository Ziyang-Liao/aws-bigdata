"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Popconfirm, message } from "antd";
import { PlusOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import type { SyncTask } from "@/types/sync-task";
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

  const fetchData = async () => {
    setLoading(true);
    try { setData(await (await fetch("/api/sync")).json()); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/sync/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchData();
  };

  const handleToggle = async (id: string, status: string) => {
    const newStatus = status === "running" ? "stopped" : "running";
    await fetch(`/api/sync/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    message.success(newStatus === "running" ? "已启动" : "已停止");
    fetchData();
  };

  const columns = [
    { title: "任务名称", dataIndex: "name", key: "name" },
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
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setModalOpen(true); }}>
            新建同步任务
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="taskId" loading={loading} />
      <SyncTaskModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData(); }} />
    </div>
  );
}
