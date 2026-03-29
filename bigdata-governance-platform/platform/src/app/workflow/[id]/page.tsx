"use client";

import React, { useEffect, useState, useRef } from "react";
import { Button, Space, message, Dropdown, Spin } from "antd";
import { SaveOutlined, PlusOutlined, ArrowLeftOutlined } from "@ant-design/icons";
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
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  useEffect(() => {
    fetch(`/api/workflow/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setNodes(data.dagDefinition?.nodes || []);
        setEdges(data.dagDefinition?.edges || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    await fetch(`/api/workflow/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dagDefinition: { nodes: nodesRef.current, edges: edgesRef.current } }),
    });
    message.success("已保存");
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
          <h2 style={{ margin: 0 }}>{name}</h2>
        </Space>
        <Space>
          <Dropdown menu={{ items: nodeTemplates.map(({ key, label, ...rest }) => ({ key, label, onClick: () => addNode({ key, label, ...rest }) })) }}>
            <Button icon={<PlusOutlined />}>添加节点</Button>
          </Dropdown>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
        </Space>
      </div>
      <DagEditor nodes={nodes} edges={edges} onChange={(n, e) => { setNodes(n); setEdges(e); }} />
    </div>
  );
}
