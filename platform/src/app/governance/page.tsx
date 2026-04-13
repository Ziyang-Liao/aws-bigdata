"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Tabs, Input, Table, Card, Tag, Space, Button, Empty, Spin, Select } from "antd";
import { SearchOutlined, DatabaseOutlined, ApartmentOutlined } from "@ant-design/icons";
import dynamic from "next/dynamic";

const ReactFlow = dynamic(() => import("reactflow").then((m) => m.default), { ssr: false });

const typeColor: Record<string, string> = { mysql: "#1677ff", postgresql: "#336791", s3: "#e47911", redshift: "#8c4fff", glue: "#00a1c9" };
const typeIcon: Record<string, string> = { mysql: "🐬", postgresql: "🐘", s3: "📁", redshift: "🏢", glue: "📊" };

export default function GovernancePage() {
  const [catalogData, setCatalogData] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [lineageFqn, setLineageFqn] = useState("");
  const [lineageData, setLineageData] = useState<any>(null);
  const [lineageLoading, setLineageLoading] = useState(false);

  const searchCatalog = async (kw?: string) => {
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/governance/catalog?keyword=${kw || keyword}`);
      const d = await res.json();
      setCatalogData(d.success ? d.data : []);
    } finally { setCatalogLoading(false); }
  };

  const loadLineage = async (fqn: string) => {
    setLineageFqn(fqn);
    setLineageLoading(true);
    try {
      const res = await fetch(`/api/governance/lineage?fqn=${encodeURIComponent(fqn)}&depth=3`);
      const d = await res.json();
      setLineageData(d.success ? d.data : null);
    } finally { setLineageLoading(false); }
  };

  useEffect(() => { searchCatalog(""); }, []);

  // Convert lineage data to ReactFlow nodes/edges
  const rfNodes = lineageData?.nodes?.map((n: any, i: number) => {
    const parts = n.fqn.split(".");
    const label = parts.slice(-1)[0];
    const dbInfo = parts.slice(0, -1).join(".");
    return {
      id: n.fqn,
      position: { x: 250 * (i % 4), y: 120 * Math.floor(i / 4) },
      data: {
        label: (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16 }}>{typeIcon[n.type] || "📋"}</div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 10, color: "#888" }}>{dbInfo}</div>
          </div>
        ),
      },
      style: {
        border: `2px solid ${typeColor[n.type] || "#d9d9d9"}`,
        borderRadius: 8, padding: 8, minWidth: 120,
        background: n.fqn === lineageData?.centerNode ? "#e6f4ff" : "#fff",
      },
    };
  }) || [];

  const rfEdges = lineageData?.edges?.map((e: any, i: number) => ({
    id: `e-${i}`, source: e.source, target: e.target, animated: true,
    label: e.lineageType, labelStyle: { fontSize: 10 },
    style: { stroke: e.lineageType === "sync" ? "#1677ff" : "#52c41a" },
  })) || [];

  const catalogColumns = [
    { title: "数据资产", key: "name", render: (_: any, r: any) => (
      <Space>
        <span>{typeIcon[r.fqn?.split(".")[0]] || "📋"}</span>
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{r.fqn}</div>
        </div>
      </Space>
    )},
    { title: "来源", dataIndex: "source", render: (v: string) => <Tag color={v === "Redshift" ? "purple" : "blue"}>{v}</Tag> },
    { title: "数据库", dataIndex: "database" },
    { title: "格式", dataIndex: "format", render: (v: string) => v ? <Tag>{v}</Tag> : "-" },
    { title: "字段数", dataIndex: "columns", render: (v: number) => v || "-" },
    { title: "操作", key: "action", render: (_: any, r: any) => (
      <Button size="small" icon={<ApartmentOutlined />} onClick={() => loadLineage(r.fqn)}>血缘</Button>
    )},
  ];

  return (
    <div>
      <h2><DatabaseOutlined /> 数据治理</h2>
      <Tabs items={[
        { key: "catalog", label: `数据目录 (${catalogData.length})`, children: (
          <div>
            <Input.Search placeholder="搜索数据资产（表名/库名）..." value={keyword} onChange={(e) => setKeyword(e.target.value)}
              onSearch={searchCatalog} enterButton={<><SearchOutlined /> 搜索</>} size="large" style={{ marginBottom: 16 }} loading={catalogLoading} />
            <Table columns={catalogColumns} dataSource={catalogData} rowKey="fqn" loading={catalogLoading} pagination={{ pageSize: 20 }} />
          </div>
        )},
        { key: "lineage", label: "数据血缘", children: (
          <div>
            <Space style={{ marginBottom: 16 }}>
              <Select showSearch style={{ width: 400 }} placeholder="输入或选择数据资产 FQN" value={lineageFqn || undefined}
                onChange={loadLineage} options={catalogData.map((c) => ({ label: `${typeIcon[c.fqn?.split(".")[0]] || ""} ${c.fqn}`, value: c.fqn }))} />
              <Button onClick={() => lineageFqn && loadLineage(lineageFqn)} loading={lineageLoading}>查询血缘</Button>
            </Space>

            {lineageLoading ? <Spin size="large" style={{ display: "block", margin: "60px auto" }} /> :
              lineageData && rfNodes.length > 0 ? (
                <div style={{ height: "60vh", border: "1px solid #f0f0f0", borderRadius: 8 }}>
                  <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
                  </ReactFlow>
                </div>
              ) : lineageFqn ? (
                <Card><Empty description="未找到血缘关系。创建同步任务后将自动生成血缘。" /></Card>
              ) : (
                <Card><Empty description="选择数据资产查看血缘关系" /></Card>
              )
            }

            {lineageData?.edges?.some((e: any) => e.columnMappings?.length) && (
              <Card title="列级血缘" size="small" style={{ marginTop: 16 }}>
                <Table size="small" pagination={false}
                  dataSource={lineageData.edges.flatMap((e: any) => (e.columnMappings || []).map((c: any, i: number) => ({
                    key: `${e.source}-${i}`, sourceTable: e.source.split(".").pop(), targetTable: e.target.split(".").pop(), ...c,
                  })))}
                  columns={[
                    { title: "源表", dataIndex: "sourceTable" },
                    { title: "源字段", dataIndex: "source", render: (v: string) => <code>{v}</code> },
                    { title: "→", width: 30, render: () => "→" },
                    { title: "目标表", dataIndex: "targetTable" },
                    { title: "目标字段", dataIndex: "target", render: (v: string) => <code>{v}</code> },
                  ]}
                />
              </Card>
            )}
          </div>
        )},
        { key: "quality", label: "数据质量", children: <Card><Empty description="配置数据质量规则（开发中）" /></Card> },
      ]} />
    </div>
  );
}
