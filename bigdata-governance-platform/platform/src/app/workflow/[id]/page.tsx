"use client";

import React, { useEffect, useState, useRef } from "react";
import { Button, Space, message, Dropdown, Spin, Tabs, Card, Tag, Badge, Table } from "antd";
import { SaveOutlined, PlusOutlined, ArrowLeftOutlined, PlayCircleOutlined, CloudUploadOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Node, Edge } from "reactflow";

const DagEditor = dynamic(() => import("@/components/dag-editor/DagEditor"), { ssr: false });

const nodeTemplates = [
  { key: "sync", label: "数据同步节点", type: "sync", data: { label: "数据同步" } },
  { key: "sql", label: "SQL 节点", type: "sql", data: { label: "SQL 执行" } },
  { key: "python", label: "Python 节点", type: "python", data: { label: "Python 脚本" } },
];

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [workflow, setWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("editor");
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  useEffect(() => {
    fetch(`/api/workflow/${id}`)
      .then((r) => r.json())
      .then((res) => {
        const data = res.success ? res.data : res;
        setWorkflow(data);
        setNodes(data.dagDefinition?.nodes || []);
        setEdges(data.dagDefinition?.edges || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    await fetch(`/api/workflow/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dagDefinition: { nodes: nodesRef.current, edges: edgesRef.current } }),
    });
    message.success("已保存");
  };

  const handlePublish = async () => {
    const res = await fetch(`/api/workflow/${id}/publish`, { method: "POST" });
    const data = await res.json();
    data.success !== false ? message.success("已发布到 Airflow") : message.error(data.error?.message || "发布失败");
  };

  const handleTrigger = async () => {
    const res = await fetch(`/api/workflow/${id}/trigger`, { method: "POST" });
    const data = await res.json();
    data.success !== false ? message.success("已触发运行") : message.error(data.error?.message || "触发失败");
  };

  const addNode = (template: (typeof nodeTemplates)[number]) => {
    const newNode: Node = {
      id: `${template.type}-${Date.now()}`,
      type: template.type,
      position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 120 },
      data: { ...template.data },
    };
    setNodes((prev) => [...prev, newNode]);
  };

  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/workflow")}>返回</Button>
          <h2 style={{ margin: 0 }}>{workflow?.name || "工作流"}</h2>
          <Badge status={workflow?.status === "active" ? "success" : "default"} text={workflow?.status} />
          {workflow?.airflowDagId && <Tag color="blue">DAG: {workflow.airflowDagId}</Tag>}
        </Space>
        <Space>
          <Dropdown menu={{ items: nodeTemplates.map(({ key, label, ...rest }) => ({ key, label, onClick: () => addNode({ key, label, ...rest }) })) }}>
            <Button icon={<PlusOutlined />}>添加节点</Button>
          </Dropdown>
          <Button icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
          <Button icon={<CloudUploadOutlined />} onClick={handlePublish}>发布</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleTrigger}>触发运行</Button>
        </Space>
      </div>

      {/* Workflow info */}
      {workflow?.description && (
        <Card size="small" style={{ marginBottom: 12 }}>
          {workflow.description}
          {workflow.cronExpression && <Tag style={{ marginLeft: 8 }}>调度: {workflow.cronExpression}</Tag>}
          <Tag style={{ marginLeft: 8 }}>{nodes.length} 节点 / {edges.length} 连线</Tag>
        </Card>
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: "editor", label: "DAG 编辑器", children: (
          <DagEditor nodes={nodes} edges={edges} onChange={(n, e) => { setNodes(n); setEdges(e); }} />
        )},
        { key: "runs", label: "运行历史", children: (
          <div>
            <Table size="small" dataSource={[]} rowKey="runId" locale={{ emptyText: "暂无运行记录。点击\"触发运行\"开始。" }}
              columns={[
                { title: "运行ID", dataIndex: "runId", width: 120 },
                { title: "状态", dataIndex: "status", render: (v: string) => <Badge status={v === "success" ? "success" : v === "failed" ? "error" : "processing"} text={v} /> },
                { title: "开始时间", dataIndex: "startedAt" },
                { title: "耗时", dataIndex: "duration" },
              ]}
            />
          </div>
        )},
        { key: "config", label: "配置", children: (
          <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, fontSize: 12, maxHeight: 400, overflow: "auto" }}>
            {JSON.stringify(workflow, null, 2)}
          </pre>
        )},
      ]} />
    </div>
  );
}
