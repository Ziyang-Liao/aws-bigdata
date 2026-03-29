"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { Button, Table, Space, Tag, Popconfirm, message } from "antd";
import { PlusOutlined, ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import type { SyncTask } from "@/types/sync-task";

const statusColors: Record<string, string> = {
  draft: "default", running: "processing", stopped: "warning", error: "error",
};
const channelLabels: Record<string, string> = {
  "zero-etl": "Zero-ETL", glue: "Glue ETL", dms: "DMS CDC",
};
const targetLabels: Record<string, string> = {
  "s3-tables": "S3 Tables", redshift: "Redshift", both: "S3 Tables + Redshift",
};

export default function SyncPage() {
  const [list, setList] = useState<SyncTask[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync");
      setList(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleStart = async (id: string) => {
    const res = await fetch(`/api/sync/${id}/start`, { method: "POST" });
    if (res.ok) { message.success("任务已启动"); fetchList(); }
    else message.error("启动失败");
  };

  const handleStop = async (id: string) => {
    const res = await fetch(`/api/sync/${id}/stop`, { method: "POST" });
    if (res.ok) { message.success("任务已停止"); fetchList(); }
    else message.error("停止失败");
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/sync/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchList();
  };

  const columns = [
    { title: "任务名称", dataIndex: "name", key: "name" },
    {
      title: "同步通道", dataIndex: "channel", key: "channel",
      render: (c: string) => <Tag>{channelLabels[c] || c}</Tag>,
    },
    {
      title: "目标", dataIndex: "targetType", key: "targetType",
      render: (t: string) => targetLabels[t] || t,
    },
    {
      title: "写入模式", dataIndex: "writeMode", key: "writeMode",
      render: (w: string) => <Tag>{w}</Tag>,
    },
    {
      title: "状态", dataIndex: "status", key: "status",
      render: (s: string) => <Tag color={statusColors[s]}>{s}</Tag>,
    },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (t: string) => t?.slice(0, 19).replace("T", " ") },
    {
      title: "操作", key: "action",
      render: (_: unknown, record: SyncTask) => (
        <Space>
          {record.status !== "running" ? (
            <a onClick={() => handleStart(record.taskId)}><PlayCircleOutlined /> 启动</a>
          ) : (
            <a onClick={() => handleStop(record.taskId)} style={{ color: "#faad14" }}><PauseCircleOutlined /> 停止</a>
          )}
          <a onClick={() => router.push(`/sync/${record.taskId}`)}>详情</a>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.taskId)}>
            <a style={{ color: "#ff4d4f" }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>数据同步</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/sync/new")}>
            新建同步任务
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={list} rowKey="taskId" loading={loading} />
    </AppLayout>
  );
}
