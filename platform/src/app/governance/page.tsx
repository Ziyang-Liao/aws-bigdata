"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Tabs, Input, Table, Card, Tag, Space, Button, Empty, Spin, Select } from "antd";
import { SearchOutlined, DatabaseOutlined, ApartmentOutlined } from "@ant-design/icons";
import dynamic from "next/dynamic";
import "reactflow/dist/style.css";

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
  const [activeTab, setActiveTab] = useState("catalog");

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

  // Convert lineage data to ReactFlow nodes/edges with layered layout
  const rfEdgesRaw = lineageData?.edges || [];
  const rfNodeData = lineageData?.nodes || [];

  // Compute layers: BFS from center node
  const layerMap: Record<string, number> = {};
  const center = lineageData?.centerNode || rfNodeData[0]?.fqn;
  if (center) {
    layerMap[center] = 0;
    const sourceOf: Record<string, string[]> = {};
    const targetOf: Record<string, string[]> = {};
    for (const e of rfEdgesRaw) {
      if (!sourceOf[e.source]) sourceOf[e.source] = [];
      sourceOf[e.source].push(e.target);
      if (!targetOf[e.target]) targetOf[e.target] = [];
      targetOf[e.target].push(e.source);
    }
    // Upstream (sources that feed into center)
    const queue = [center];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const src of (targetOf[cur] || [])) {
        if (!(src in layerMap)) { layerMap[src] = layerMap[cur] - 1; queue.push(src); }
      }
      for (const tgt of (sourceOf[cur] || [])) {
        if (!(tgt in layerMap)) { layerMap[tgt] = layerMap[cur] + 1; queue.push(tgt); }
      }
    }
  }
  // Normalize layers to start from 0
  const minLayer = Math.min(0, ...Object.values(layerMap));
  const layerNodes: Record<number, string[]> = {};
  for (const [fqn, layer] of Object.entries(layerMap)) {
    const l = layer - minLayer;
    if (!layerNodes[l]) layerNodes[l] = [];
    layerNodes[l].push(fqn);
  }

  const rfNodes = rfNodeData.map((n: any) => {
    const layer = (layerMap[n.fqn] || 0) - minLayer;
    const siblings = layerNodes[layer] || [n.fqn];
    const idx = siblings.indexOf(n.fqn);
    const parts = n.fqn.split(".");
    const label = parts.slice(-1)[0];
    const dbInfo = parts.slice(0, -1).join(".");
    return {
      id: n.fqn,
      position: { x: layer * 300, y: idx * 140 },
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
        borderRadius: 8, padding: 8, minWidth: 140,
        background: n.fqn === center ? "#e6f4ff" : "#fff",
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
      <Button size="small" icon={<ApartmentOutlined />} onClick={() => { loadLineage(r.fqn); setActiveTab("lineage"); }}>血缘</Button>
    )},
  ];

  return (
    <div>
      <h2><DatabaseOutlined /> 数据治理</h2>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
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

            {lineageData?.edges?.some((e: any) => e.columnMappings?.length) && (() => {
              const colRows = lineageData.edges.flatMap((e: any) => (e.columnMappings || []).map((c: any, i: number) => ({
                key: `${e.source}-${i}`, sourceTable: e.source.split(".").pop(), targetTable: e.target.split(".").pop(), ...c,
              })));
              // Build column-level ReactFlow graph
              const colGroups: Record<string, { table: string; side: "source" | "target"; cols: string[] }> = {};
              for (const r of colRows) {
                const sk = `src:${r.sourceTable}`;
                const tk = `tgt:${r.targetTable}`;
                if (!colGroups[sk]) colGroups[sk] = { table: r.sourceTable, side: "source", cols: [] };
                if (!colGroups[tk]) colGroups[tk] = { table: r.targetTable, side: "target", cols: [] };
                if (!colGroups[sk].cols.includes(r.source)) colGroups[sk].cols.push(r.source);
                if (!colGroups[tk].cols.includes(r.target)) colGroups[tk].cols.push(r.target);
              }
              const colNodes: any[] = [];
              const colEdges: any[] = [];
              const groups = Object.values(colGroups);
              const srcGroups = groups.filter((g) => g.side === "source");
              const tgtGroups = groups.filter((g) => g.side === "target");
              let yOff = 0;
              for (const g of srcGroups) {
                colNodes.push({
                  id: `src:${g.table}`, position: { x: 0, y: yOff }, type: "default",
                  data: { label: (<div style={{ textAlign: "left", minWidth: 160 }}><div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 4 }}>🐬 {g.table}</div>{g.cols.map((c) => <div key={c} style={{ fontSize: 11, padding: "1px 0" }}>{c}</div>)}</div>) },
                  style: { border: "2px solid #1677ff", borderRadius: 8, padding: 8, background: "#f0f5ff" },
                });
                yOff += 60 + g.cols.length * 20;
              }
              yOff = 0;
              for (const g of tgtGroups) {
                colNodes.push({
                  id: `tgt:${g.table}`, position: { x: 450, y: yOff }, type: "default",
                  data: { label: (<div style={{ textAlign: "left", minWidth: 160 }}><div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 4 }}>🏢 {g.table}</div>{g.cols.map((c) => <div key={c} style={{ fontSize: 11, padding: "1px 0" }}>{c}</div>)}</div>) },
                  style: { border: "2px solid #8c4fff", borderRadius: 8, padding: 8, background: "#f9f0ff" },
                });
                yOff += 60 + g.cols.length * 20;
              }
              for (const r of colRows) {
                colEdges.push({
                  id: `col-${r.key}`, source: `src:${r.sourceTable}`, target: `tgt:${r.targetTable}`,
                  animated: true, label: `${r.source} → ${r.target}`, labelStyle: { fontSize: 9, fill: "#888" },
                  style: { stroke: "#1677ff" },
                });
              }
              return (
                <Card title="列级血缘" size="small" style={{ marginTop: 16 }}>
                  <Tabs size="small" items={[
                    { key: "graph", label: "图形视图", children: (
                      <div style={{ height: Math.max(300, yOff + 60), border: "1px solid #f0f0f0", borderRadius: 8 }}>
                        <ReactFlow nodes={colNodes} edges={colEdges} fitView />
                      </div>
                    )},
                    { key: "table", label: "表格视图", children: (
                      <Table size="small" pagination={false} dataSource={colRows}
                        columns={[
                          { title: "源表", dataIndex: "sourceTable" },
                          { title: "源字段", dataIndex: "source", render: (v: string) => <code>{v}</code> },
                          { title: "→", width: 30, render: () => "→" },
                          { title: "目标表", dataIndex: "targetTable" },
                          { title: "目标字段", dataIndex: "target", render: (v: string) => <code>{v}</code> },
                        ]}
                      />
                    )},
                  ]} />
                </Card>
              );
            })()}
          </div>
        )},
        { key: "quality", label: "数据质量", children: <Card><Empty description="配置数据质量规则（开发中）" /></Card> },
      ]} />
    </div>
  );
}
