"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button, Space, Table, Alert, Spin, Select, Tabs, message, Input, Popconfirm, Card, Descriptions, Tag, Tree, Divider } from "antd";
import { PlayCircleOutlined, ClearOutlined, SaveOutlined, DeleteOutlined, DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const SQL_TEMPLATES = [
  { label: "选择模板...", value: "" },
  { label: "CREATE TABLE AS", value: "CREATE TABLE new_table AS\nSELECT * FROM source_table\nWHERE 1=1;" },
  { label: "MERGE (Upsert)", value: "MERGE INTO target USING source ON target.id = source.id\nWHEN MATCHED THEN UPDATE SET target.col = source.col\nWHEN NOT MATCHED THEN INSERT VALUES (source.id, source.col);" },
  { label: "UNLOAD to S3", value: "UNLOAD ('SELECT * FROM my_table')\nTO 's3://my-bucket/prefix/'\nIAM_ROLE default\nPARQUET;" },
  { label: "查看表结构", value: "SELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_schema = 'public' AND table_name = 'your_table'\nORDER BY ordinal_position;" },
];

export default function RedshiftPage() {
  const [sql, setSql] = useState("SELECT 1;");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [savedTasks, setSavedTasks] = useState<any[]>([]);
  const [taskName, setTaskName] = useState("");
  const pollRef = useRef<NodeJS.Timeout>(undefined);

  // Connection state
  const [workgroups, setWorkgroups] = useState<any[]>([]);
  const [selectedWg, setSelectedWg] = useState("bgp-workgroup");
  const [selectedDb, setSelectedDb] = useState("dev");
  const [schemas, setSchemas] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const fetchTasks = () => fetch("/api/redshift/tasks").then((r) => r.json()).then(setSavedTasks);
  const fetchWorkgroups = () => fetch("/api/redshift/connections").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setWorkgroups(d); });

  const fetchSchemas = async () => {
    setLoadingSchema(true);
    try {
      const res = await fetch(`/api/redshift/schemas?workgroup=${selectedWg}&database=${selectedDb}`);
      setSchemas(await res.json());
    } finally { setLoadingSchema(false); }
  };

  useEffect(() => { fetchTasks(); fetchWorkgroups(); }, []);

  const handleExecute = async () => {
    setRunning(true); setResult(null); setError("");
    try {
      const res = await fetch("/api/redshift/execute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, workgroupName: selectedWg, database: selectedDb }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setRunning(false); return; }
      const poll = async () => {
        const r = await fetch(`/api/redshift/result/${data.statementId}`);
        const d = await r.json();
        if (d.status === "FINISHED") { setResult(d); setRunning(false); }
        else if (d.status === "FAILED") { setError(d.error || "执行失败"); setRunning(false); }
        else { pollRef.current = setTimeout(poll, 1500); }
      };
      poll();
    } catch (e: any) { setError(e.message); setRunning(false); }
  };

  const handleSave = async () => {
    if (!taskName) { message.warning("请输入任务名称"); return; }
    await fetch("/api/redshift/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: taskName, sql, workgroupName: selectedWg, database: selectedDb }) });
    message.success("已保存"); setTaskName(""); fetchTasks();
  };

  const handleDeleteTask = async (id: string) => {
    await fetch(`/api/redshift/tasks/${id}`, { method: "DELETE" }); message.success("已删除"); fetchTasks();
  };

  const schemaTreeData = schemas?.schemas?.map((s: any) => ({
    title: <span>📁 {s.name}</span>, key: s.name, selectable: false,
    children: schemas.tables?.filter((t: any) => t.schema === s.name).map((t: any) => ({
      title: <Space><span>📋 {t.table}</span><Tag style={{ fontSize: 10 }}>{t.owner}</Tag></Space>,
      key: `${s.name}.${t.table}`, isLeaf: true,
    })) || [],
  })) || [];

  return (
    <div>
      <h2><DatabaseOutlined /> Redshift 任务</h2>

      {/* Connection Config */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span style={{ fontWeight: 500 }}>连接配置:</span>
          <Select value={selectedWg} onChange={setSelectedWg} style={{ width: 200 }} placeholder="Workgroup"
            options={workgroups.length > 0 ? workgroups.map((w) => ({ label: `${w.workgroupName} (${w.status})`, value: w.workgroupName })) : [{ label: "bgp-workgroup", value: "bgp-workgroup" }]} />
          <Select value={selectedDb} onChange={setSelectedDb} style={{ width: 140 }} options={[{ label: "dev", value: "dev" }, { label: "sample_data_dev", value: "sample_data_dev" }]} />
          <Button icon={<ReloadOutlined />} onClick={fetchSchemas} loading={loadingSchema}>加载 Schema</Button>
          {workgroups.find((w) => w.workgroupName === selectedWg)?.endpoint && (
            <Tag color="green">Endpoint: {workgroups.find((w) => w.workgroupName === selectedWg)?.endpoint}</Tag>
          )}
        </Space>
      </Card>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Left: Schema Browser */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <Card size="small" title="数据库对象" style={{ height: "calc(100vh - 280px)", overflow: "auto" }}>
            {schemas ? (
              <Tree treeData={schemaTreeData} defaultExpandAll
                onSelect={(keys) => {
                  const k = keys[0] as string;
                  if (k?.includes(".")) setSql(`SELECT * FROM ${k} LIMIT 100;`);
                }} />
            ) : <div style={{ color: "#999", textAlign: "center", padding: 20 }}>点击"加载 Schema"<br/>浏览数据库对象</div>}
          </Card>
        </div>

        {/* Right: Editor + Results */}
        <div style={{ flex: 1 }}>
          <Tabs items={[
            { key: "editor", label: "SQL 编辑器", children: (<>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <Space>
                  <Select style={{ width: 180 }} options={SQL_TEMPLATES} onChange={(v) => { if (v) setSql(v); }} placeholder="SQL 模板" />
                  <Button icon={<ClearOutlined />} onClick={() => { setSql(""); setResult(null); setError(""); }}>清空</Button>
                </Space>
                <Space>
                  <Input placeholder="任务名称" value={taskName} onChange={(e) => setTaskName(e.target.value)} style={{ width: 140 }} />
                  <Button icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecute} loading={running}>执行</Button>
                </Space>
              </div>
              <div style={{ border: "1px solid #d9d9d9", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                <MonacoEditor height="280px" language="sql" value={sql} onChange={(v) => setSql(v || "")} options={{ minimap: { enabled: false }, fontSize: 14 }} />
              </div>
              {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
              {running && <Spin tip="执行中..." style={{ display: "block", margin: "20px auto" }} />}
              {result && (
                <Table size="small"
                  dataSource={result.rows?.map((row: any[], i: number) => {
                    const obj: any = { _key: i };
                    result.columns.forEach((col: string, j: number) => { obj[col] = row[j]; });
                    return obj;
                  })}
                  columns={result.columns?.map((col: string) => ({ title: col, dataIndex: col, key: col, ellipsis: true }))}
                  rowKey="_key" scroll={{ x: true }} pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 行` }}
                />
              )}
            </>)},
            { key: "tasks", label: `已保存任务 (${savedTasks.length})`, children: (
              <Table columns={[
                { title: "名称", dataIndex: "name", key: "name" },
                { title: "Workgroup", dataIndex: "workgroupName", key: "wg", render: (v: string) => v || "bgp-workgroup" },
                { title: "Database", dataIndex: "database", key: "db", render: (v: string) => v || "dev" },
                { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
                { title: "操作", key: "action", render: (_: any, r: any) => (
                  <Space>
                    <a onClick={() => { setSql(r.sql); if (r.workgroupName) setSelectedWg(r.workgroupName); if (r.database) setSelectedDb(r.database); }}>加载</a>
                    <Popconfirm title="确认删除？" onConfirm={() => handleDeleteTask(r.taskId)}><a style={{ color: "red" }}><DeleteOutlined /></a></Popconfirm>
                  </Space>
                )},
              ]} dataSource={savedTasks} rowKey="taskId" />
            )},
          ]} />
        </div>
      </div>
    </div>
  );
}
