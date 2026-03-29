"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button, Space, Table, Alert, Spin, Select, Tabs, message, Input, Popconfirm } from "antd";
import { PlayCircleOutlined, ClearOutlined, SaveOutlined, DeleteOutlined } from "@ant-design/icons";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const SQL_TEMPLATES = [
  { label: "选择模板...", value: "" },
  { label: "CREATE TABLE AS", value: "CREATE TABLE new_table AS\nSELECT * FROM source_table\nWHERE 1=1;" },
  { label: "MERGE (Upsert)", value: "MERGE INTO target USING source ON target.id = source.id\nWHEN MATCHED THEN UPDATE SET target.col = source.col\nWHEN NOT MATCHED THEN INSERT VALUES (source.id, source.col);" },
  { label: "UNLOAD to S3", value: "UNLOAD ('SELECT * FROM my_table')\nTO 's3://my-bucket/prefix/'\nIAM_ROLE 'arn:aws:iam::role/MyRole'\nPARQUET;" },
];

export default function RedshiftPage() {
  const [sql, setSql] = useState("SELECT 1;");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [savedTasks, setSavedTasks] = useState<any[]>([]);
  const [taskName, setTaskName] = useState("");
  const pollRef = useRef<NodeJS.Timeout>(undefined);

  const fetchTasks = () => fetch("/api/redshift/tasks").then((r) => r.json()).then(setSavedTasks);
  useEffect(() => { fetchTasks(); }, []);

  const handleExecute = async () => {
    setRunning(true); setResult(null); setError("");
    try {
      const res = await fetch("/api/redshift/execute", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setRunning(false); return; }
      const poll = async () => {
        const r = await fetch(`/api/redshift/result/${data.statementId}`);
        const d = await r.json();
        if (d.status === "FINISHED") { setResult(d); setRunning(false); }
        else if (d.status === "FAILED") { setError(d.error || "执行失败"); setRunning(false); }
        else { pollRef.current = setTimeout(poll, 1000); }
      };
      poll();
    } catch (e: any) { setError(e.message); setRunning(false); }
  };

  const handleSave = async () => {
    if (!taskName) { message.warning("请输入任务名称"); return; }
    await fetch("/api/redshift/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: taskName, sql }),
    });
    message.success("已保存");
    setTaskName("");
    fetchTasks();
  };

  const handleDeleteTask = async (id: string) => {
    await fetch(`/api/redshift/tasks/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchTasks();
  };

  const taskColumns = [
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    {
      title: "操作", key: "action",
      render: (_: any, r: any) => (
        <Space>
          <a onClick={() => setSql(r.sql)}>加载</a>
          <Popconfirm title="确认删除？" onConfirm={() => handleDeleteTask(r.taskId)}>
            <a style={{ color: "red" }}><DeleteOutlined /></a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2>Redshift 任务</h2>
      <Tabs items={[
        {
          key: "editor",
          label: "SQL 编辑器",
          children: (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <Space>
                  <Select style={{ width: 200 }} options={SQL_TEMPLATES} onChange={(v) => { if (v) setSql(v); }} placeholder="SQL 模板" />
                  <Button icon={<ClearOutlined />} onClick={() => { setSql(""); setResult(null); setError(""); }}>清空</Button>
                </Space>
                <Space>
                  <Input placeholder="任务名称" value={taskName} onChange={(e) => setTaskName(e.target.value)} style={{ width: 160 }} />
                  <Button icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecute} loading={running}>执行</Button>
                </Space>
              </div>
              <div style={{ border: "1px solid #d9d9d9", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <MonacoEditor height="300px" language="sql" value={sql} onChange={(v) => setSql(v || "")} options={{ minimap: { enabled: false }, fontSize: 14 }} />
              </div>
              {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
              {running && <Spin tip="执行中..." style={{ display: "block", margin: "20px auto" }} />}
              {result && (
                <Table
                  size="small"
                  dataSource={result.rows?.map((row: any[], i: number) => {
                    const obj: any = { _key: i };
                    result.columns.forEach((col: string, j: number) => { obj[col] = row[j]; });
                    return obj;
                  })}
                  columns={result.columns?.map((col: string) => ({ title: col, dataIndex: col, key: col }))}
                  rowKey="_key"
                  scroll={{ x: true }}
                  pagination={{ pageSize: 50 }}
                  footer={() => `共 ${result.totalRows ?? 0} 行`}
                />
              )}
            </>
          ),
        },
        {
          key: "tasks",
          label: "已保存任务",
          children: <Table columns={taskColumns} dataSource={savedTasks} rowKey="taskId" />,
        },
      ]} />
    </div>
  );
}
