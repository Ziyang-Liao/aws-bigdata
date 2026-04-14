"use client";

import React, { useEffect, useState } from "react";
import { Button, Card, Descriptions, Space, Table, Tabs, Tag, Spin, message, Badge, Alert, Modal } from "antd";
import { ArrowLeftOutlined, PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";

const channelLabel: Record<string, string> = { "zero-etl": "Zero-ETL", glue: "Glue ETL", dms: "DMS CDC" };
const statusBadge: Record<string, any> = { draft: "default", running: "processing", stopped: "warning", error: "error", active: "success" };

export default function SyncDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<any>(null);
  const [runs, setRuns] = useState<any>({ runs: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [glueRun, setGlueRun] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [s3Files, setS3Files] = useState<any[]>([]);
  const [runLogModal, setRunLogModal] = useState<{ open: boolean; runId: string; logs: string[]; loading: boolean }>({ open: false, runId: "", logs: [], loading: false });

  const fetchTask = async () => {
    const res = await fetch(`/api/sync/${id}`);
    const d = await res.json();
    setTask(d.success ? d.data : d);
  };

  const fetchRuns = async () => {
    const res = await fetch(`/api/sync/${id}/runs`);
    const d = await res.json();
    setRuns(d.success ? d.data : d);
  };

  const fetchGlueStatus = async (jobName: string) => {
    try {
      const res = await fetch(`/api/sync/${id}/glue-status`);
      const d = await res.json();
      if (d.success) {
        setGlueRun(d.data);
        // If Glue finished, refresh task and runs to get updated status
        if (d.data?.state === "SUCCEEDED" || d.data?.state === "FAILED") {
          fetchTask();
          fetchRuns();
        }
      }
    } catch {}
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/sync/${id}/logs`);
      const d = await res.json();
      setLogs(d.success ? d.data : d.logs || []);
    } catch {} finally { setLogsLoading(false); }
  };

  const fetchS3Output = async () => {
    try {
      const res = await fetch(`/api/sync/${id}/output`);
      const d = await res.json();
      if (d.success) setS3Files(d.data);
    } catch {}
  };

  useEffect(() => {
    Promise.all([fetchTask(), fetchRuns()]).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (task?.glueJobName) { fetchGlueStatus(task.glueJobName); fetchLogs(); fetchS3Output(); }
  }, [task?.glueJobName]);

  // Auto-refresh when running
  useEffect(() => {
    if (task?.status !== "running") return;
    const timer = setInterval(() => { fetchTask(); fetchGlueStatus(task.glueJobName); fetchLogs(); }, 10000);
    return () => clearInterval(timer);
  }, [task?.status]);

  const handleToggle = async () => {
    const action = task.status === "running" ? "stop" : "start";
    const res = await fetch(`/api/sync/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    if (data.success === false) { message.error(data.error?.message || "操作失败"); return; }
    message.success(action === "start" ? "已启动" : "已停止");
    fetchTask();
    if (action === "start") setTimeout(() => { fetchGlueStatus(task.glueJobName); fetchLogs(); }, 5000);
  };

  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (!task) return <div>任务不存在</div>;

  const isS3Tables = !!task.s3Config?.tableBucket;
  const outputDisplay = isS3Tables
    ? `S3 Tables: ${task.s3Config.tableBucket}/${task.s3Config.namespace || "ecommerce"}`
    : task.s3Config?.bucket ? `s3://${task.s3Config.bucket}/${task.s3Config.prefix || ""}` : null;


  const viewRunLog = async (runId: string) => {
    setRunLogModal({ open: true, runId, logs: [], loading: true });
    try {
      const res = await fetch(`/api/sync/${id}/runs/${runId}/logs`);
      const d = await res.json();
      const logs = d.success ? (d.data?.logs || []) : ["加载失败"];
      setRunLogModal({ open: true, runId, logs, loading: false });
    } catch {
      setRunLogModal({ open: true, runId, logs: ["加载失败"], loading: false });
    }
  };

  const runColumns = [
    { title: "#", key: "idx", render: (_: any, __: any, i: number) => runs.runs.length - i },
    { title: "开始时间", dataIndex: "startedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    { title: "耗时", dataIndex: "duration", render: (v: number) => v ? `${Math.floor(v / 60)}m${v % 60}s` : "-" },
    { title: "读取", key: "read", render: (_: any, r: any) => r.metrics?.rowsRead?.toLocaleString() || "-" },
    { title: "写入", key: "write", render: (_: any, r: any) => r.metrics?.rowsWritten?.toLocaleString() || "-" },
    { title: "状态", dataIndex: "status", render: (v: string) => <Badge status={statusBadge[v] || "default"} text={v === "succeeded" ? "成功" : v === "failed" ? "失败" : v} /> },
    { title: "错误", dataIndex: "error", ellipsis: true, render: (v: string) => v ? <Tag color="red">{v.slice(0, 60)}</Tag> : "-" },
    { title: "日志", key: "log", width: 80, render: (_: any, r: any) => (
      <Button size="small" type="link" onClick={() => viewRunLog(r.runId)}>
        {r.logS3Key ? "📋 查看" : r.status === "running" ? "⏳" : "📋 查看"}
      </Button>
    )},
  ];

  const mappingData = task.fieldMappings ? Object.entries(task.fieldMappings).flatMap(([table, fields]: [string, any]) =>
    (fields || []).map((f: any, i: number) => ({ key: `${table}-${i}`, table, ...f }))
  ) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/sync")}>返回</Button>
          <h2 style={{ margin: 0 }}>{task.name || "同步任务"}</h2>
          <Badge status={statusBadge[task.status] || "default"} text={task.status} />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchTask(); fetchRuns(); fetchLogs(); fetchS3Output(); }}>刷新</Button>
          <Button icon={task.status === "running" ? <PauseCircleOutlined /> : <PlayCircleOutlined />} type="primary" onClick={handleToggle}>
            {task.status === "running" ? "停止" : "启动"}
          </Button>
        </Space>
      </div>

      {/* Config Summary */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="通道">{channelLabel[task.channel] || task.channel}</Descriptions.Item>
          <Descriptions.Item label="模式">{task.syncMode === "full" ? "全量" : "增量"} / {task.writeMode}</Descriptions.Item>
          <Descriptions.Item label="目标">{task.targetType?.toUpperCase()}</Descriptions.Item>
          <Descriptions.Item label="调度">{task.cronExpression || "未配置"}</Descriptions.Item>
          <Descriptions.Item label="源表">{task.sourceTables?.join(", ")}</Descriptions.Item>
          <Descriptions.Item label="Glue Job"><Tag color="blue">{task.glueJobName || "未创建"}</Tag></Descriptions.Item>
          {outputDisplay && <Descriptions.Item label="数据输出" span={2}><Tag color="green">{outputDisplay}</Tag></Descriptions.Item>}
        </Descriptions>
      </Card>

      {/* Glue Run Status */}
      {glueRun && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={4} size="small" title="最近运行">
            <Descriptions.Item label="状态"><Badge status={glueRun.state === "SUCCEEDED" ? "success" : glueRun.state === "FAILED" ? "error" : glueRun.state === "RUNNING" ? "processing" : "default"} text={glueRun.state} /></Descriptions.Item>
            <Descriptions.Item label="开始">{glueRun.startedOn?.slice(0, 19).replace("T", " ")}</Descriptions.Item>
            <Descriptions.Item label="耗时">{glueRun.executionTime ? `${glueRun.executionTime}s` : "-"}</Descriptions.Item>
            <Descriptions.Item label="DPU">{glueRun.dpuSeconds || "-"}</Descriptions.Item>
            {glueRun.errorMessage && <Descriptions.Item label="错误" span={4}><Alert type="error" message={glueRun.errorMessage} /></Descriptions.Item>}
          </Descriptions>
        </Card>
      )}

      {/* Stats */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size={48}>
          <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{runs.stats?.total || 0}</div><div style={{ color: "#888" }}>运行次数</div></div>
          <div><div style={{ fontSize: 24, fontWeight: "bold", color: "#52c41a" }}>{runs.stats?.successRate ? (runs.stats.successRate * 100).toFixed(0) + "%" : "N/A"}</div><div style={{ color: "#888" }}>成功率</div></div>
          <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{runs.stats?.avgDuration ? Math.round(runs.stats.avgDuration) + "s" : "N/A"}</div><div style={{ color: "#888" }}>平均耗时</div></div>
          <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{runs.stats?.totalRows?.toLocaleString() || 0}</div><div style={{ color: "#888" }}>累计行数</div></div>
        </Space>
      </Card>

      <Tabs items={[
        { key: "logs", label: "运行日志", children: (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <Button size="small" onClick={fetchLogs} loading={logsLoading}>刷新日志</Button>
            </div>
            <div style={{ maxHeight: 500, overflow: "auto", background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
              {logs.length > 0 ? logs.map((line, i) => (
                <div key={i} style={{ color: line.includes("ERROR") || line.includes("error") ? "#ff6b6b" : line.includes("WARN") ? "#ffd43b" : line.includes("SYNC RESULTS") || line.includes("completed") ? "#69db7c" : "#d4d4d4" }}>
                  {line}
                </div>
              )) : <span style={{ color: "#808080" }}>{task.glueJobName ? "日志加载中... 任务启动后约 30 秒开始输出日志" : "任务未启动，无日志"}</span>}
            </div>
          </div>
        )},
        { key: "output", label: "输出结果", children: (
          <div>
            {outputDisplay && (
              <Alert type="info" message={`数据输出位置: ${outputDisplay}`} style={{ marginBottom: 16 }} />
            )}
            {s3Files.length > 0 ? (
              <Table size="small" dataSource={s3Files} rowKey="key" columns={[
                { title: "文件路径", dataIndex: "key", render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code> },
                { title: "大小", dataIndex: "size", render: (v: number) => v > 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(1)} MB` : `${(v / 1024).toFixed(1)} KB` },
                { title: "修改时间", dataIndex: "lastModified", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
              ]} />
            ) : <div style={{ color: "#999", textAlign: "center", padding: 40 }}>任务运行完成后将显示输出文件列表</div>}
          </div>
        )},
        { key: "runs", label: `运行历史 (${runs.runs?.length || 0})`, children: <Table columns={runColumns} dataSource={runs.runs} rowKey="runId" size="small" /> },
        { key: "mapping", label: "字段映射", children: (
          <Table size="small" dataSource={mappingData} pagination={false} columns={[
            { title: "表", dataIndex: "table", render: (v: string) => <b>{v}</b> },
            { title: "源字段", dataIndex: "source", render: (v: string) => <code>{v}</code> },
            { title: "源类型", dataIndex: "sourceType", render: (v: string) => <Tag>{v}</Tag> },
            { title: "→", width: 30, render: () => "→" },
            { title: "目标字段", dataIndex: "target", render: (v: string) => <code>{v}</code> },
            { title: "目标类型", dataIndex: "targetType", render: (v: string) => <Tag color="blue">{v}</Tag> },
          ]} />
        )},
        { key: "config", label: "完整配置", children: (
          <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, fontSize: 12, maxHeight: 400, overflow: "auto" }}>
            {JSON.stringify(task, null, 2)}
          </pre>
        )},
      ]} />

      <Modal title={`运行日志 - ${runLogModal.runId?.slice(-8)}`} open={runLogModal.open}
        onCancel={() => setRunLogModal({ open: false, runId: "", logs: [], loading: false })} footer={null} width={900}>
        {runLogModal.loading ? <Spin style={{ display: "block", margin: "40px auto" }} /> : (
          <div style={{ maxHeight: 500, overflow: "auto", background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
            {runLogModal.logs.length > 0 ? runLogModal.logs.map((line, i) => (
              <div key={i} style={{ color: line.includes("ERROR") || line.includes("Exception") ? "#ff6b6b" : line.includes("WARN") ? "#ffd43b" : line.includes("SYNC RESULTS") || line.includes("completed") || line.includes("Written") ? "#69db7c" : "#d4d4d4" }}>
                {line}
              </div>
            )) : <span style={{ color: "#808080" }}>暂无日志</span>}
          </div>
        )}
      </Modal>
    </div>
  );
}
