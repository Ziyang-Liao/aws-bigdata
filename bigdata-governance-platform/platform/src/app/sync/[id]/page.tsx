"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { Descriptions, Table, Tag, Button, Space, Card, message } from "antd";
import { PlayCircleOutlined, PauseCircleOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";
import type { SyncTask } from "@/types/sync-task";

interface JobRun {
  id: string;
  status: string;
  startedOn: string;
  completedOn?: string;
  executionTime?: number;
  errorMessage?: string;
}

const statusColors: Record<string, string> = {
  RUNNING: "processing", SUCCEEDED: "success", FAILED: "error", STOPPED: "warning", STARTING: "default",
};

export default function SyncDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<SyncTask | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const router = useRouter();

  const fetchTask = () => fetch(`/api/sync/${id}`).then(r => r.json()).then(setTask);
  const fetchRuns = () => fetch(`/api/sync/${id}/runs`).then(r => r.json()).then(setRuns);

  useEffect(() => {
    fetch(`/api/sync/${id}`).then(r => r.json()).then(setTask);
    fetch(`/api/sync/${id}/runs`).then(r => r.json()).then(setRuns);
  }, [id]);

  const handleStart = async () => {
    const res = await fetch(`/api/sync/${id}/start`, { method: "POST" });
    if (res.ok) { message.success("已启动"); fetchTask(); fetchRuns(); }
  };
  const handleStop = async () => {
    const res = await fetch(`/api/sync/${id}/stop`, { method: "POST" });
    if (res.ok) { message.success("已停止"); fetchTask(); fetchRuns(); }
  };

  const runColumns = [
    { title: "Run ID", dataIndex: "id", key: "id", render: (v: string) => v?.slice(0, 8) },
    { title: "状态", dataIndex: "status", key: "status", render: (s: string) => <Tag color={statusColors[s]}>{s}</Tag> },
    { title: "开始时间", dataIndex: "startedOn", key: "startedOn", render: (t: string) => t?.slice(0, 19).replace("T", " ") },
    { title: "完成时间", dataIndex: "completedOn", key: "completedOn", render: (t: string) => t?.slice(0, 19).replace("T", " ") || "-" },
    { title: "耗时(秒)", dataIndex: "executionTime", key: "executionTime" },
    { title: "错误信息", dataIndex: "errorMessage", key: "errorMessage", render: (e: string) => e || "-" },
  ];

  if (!task) return <AppLayout><p>加载中...</p></AppLayout>;

  return (
    <AppLayout>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/sync")}>返回</Button>
          <h2 style={{ margin: 0 }}>{task.name}</h2>
          <Tag color={task.status === "running" ? "processing" : "default"}>{task.status}</Tag>
        </Space>
        <Space>
          {task.status !== "running" ? (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart}>启动</Button>
          ) : (
            <Button icon={<PauseCircleOutlined />} onClick={handleStop}>停止</Button>
          )}
        </Space>
      </div>

      <Card title="任务配置" style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="同步通道">{task.channel}</Descriptions.Item>
          <Descriptions.Item label="同步模式">{task.syncMode}</Descriptions.Item>
          <Descriptions.Item label="目标类型">{task.targetType}</Descriptions.Item>
          <Descriptions.Item label="写入模式">{task.writeMode}</Descriptions.Item>
          <Descriptions.Item label="源数据库">{task.sourceDatabase}</Descriptions.Item>
          <Descriptions.Item label="源表">{task.sourceTables?.join(", ")}</Descriptions.Item>
          {task.s3Config && (
            <>
              <Descriptions.Item label="S3 Namespace">{task.s3Config.namespace}</Descriptions.Item>
              <Descriptions.Item label="分区字段">{task.s3Config.partitionFields?.map(p => p.field).join(", ") || "-"}</Descriptions.Item>
            </>
          )}
          {task.redshiftConfig && (
            <>
              <Descriptions.Item label="Redshift Workgroup">{task.redshiftConfig.workgroupName}</Descriptions.Item>
              <Descriptions.Item label="排序键">{task.redshiftConfig.sortKeys?.join(", ") || "-"}</Descriptions.Item>
              <Descriptions.Item label="分布键">{task.redshiftConfig.distKey || "-"}</Descriptions.Item>
              <Descriptions.Item label="分布方式">{task.redshiftConfig.distStyle}</Descriptions.Item>
            </>
          )}
        </Descriptions>
      </Card>

      <Card title="运行历史">
        <Table columns={runColumns} dataSource={runs} rowKey="id" pagination={{ pageSize: 10 }} />
      </Card>
    </AppLayout>
  );
}
