"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Popconfirm, message, Drawer, Descriptions, Collapse, Badge } from "antd";
import { PlusOutlined, ReloadOutlined, DatabaseOutlined, TableOutlined } from "@ant-design/icons";
import type { DataSource } from "@/types/datasource";
import DataSourceModal from "./DataSourceModal";

const statusColor: Record<string, string> = { active: "green", inactive: "default", error: "red" };
const typeIcon: Record<string, string> = { mysql: "🐬", postgresql: "🐘", oracle: "🔶", sqlserver: "🔷" };

export default function DatasourcesPage() {
  const [data, setData] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataSource | undefined>();
  const [metaDrawer, setMetaDrawer] = useState<{ open: boolean; ds?: DataSource; tables: any[] }>({ open: false, tables: [] });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/datasources");
      const json = await res.json();
      setData(json.success ? json.data : json);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasources/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchData();
  };

  const browseMeta = async (ds: DataSource) => {
    setMetaDrawer({ open: true, ds, tables: [] });
    const res = await fetch(`/api/datasources/${ds.datasourceId}/tables?database=${ds.database}`);
    const tables = await res.json();
    setMetaDrawer({ open: true, ds, tables });
  };

  const columns = [
    {
      title: "数据源", key: "name",
      render: (_: any, r: DataSource) => (
        <Space>
          <span style={{ fontSize: 18 }}>{typeIcon[r.type]}</span>
          <div>
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{r.type?.toUpperCase()}</div>
          </div>
        </Space>
      ),
    },
    {
      title: "连接信息", key: "connection",
      render: (_: any, r: DataSource) => (
        <div style={{ fontSize: 12 }}>
          <div>主机: <code>{r.host}</code></div>
          <div>端口: {r.port} | 库: {r.database}</div>
          <div>用户: {r.username}</div>
        </div>
      ),
    },
    {
      title: "Glue Connection", dataIndex: "glueConnectionName", key: "glue",
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Tag>未关联</Tag>,
    },
    {
      title: "密码存储", dataIndex: "secretArn", key: "secret",
      render: (v: string) => v ? <Tag color="green">🔒 Secrets Manager</Tag> : <Tag color="red">⚠️ 未加密</Tag>,
    },
    { title: "状态", dataIndex: "status", key: "status", render: (v: string, r: DataSource) => {
      const m: Record<string, { s: "success"|"error"|"default"|"processing"|"warning"; t: string }> = {
        active: { s: "success", t: "已连接" }, testing: { s: "processing", t: "测试中" },
        error: { s: "error", t: "异常" }, unreachable: { s: "warning", t: "不可达" }, inactive: { s: "default", t: "未激活" },
      };
      const st = m[v] || m.inactive;
      return <div><Badge status={st.s} text={st.t} />{r.testResult?.totalMs ? <span style={{ fontSize: 11, color: "#888" }}> ({r.testResult.totalMs}ms)</span> : null}</div>;
    }},
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " "), width: 170 },
    {
      title: "操作", key: "action", width: 220,
      render: (_: any, record: DataSource) => (
        <Space>
          <Button size="small" icon={<TableOutlined />} onClick={() => browseMeta(record)}>浏览表</Button>
          <a onClick={() => { setEditing(record); setModalOpen(true); }}>编辑</a>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.datasourceId)}>
            <a style={{ color: "red" }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><DatabaseOutlined /> 数据源管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setModalOpen(true); }}>新建数据源</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="datasourceId" loading={loading} />
      <DataSourceModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); fetchData(); }} />

      <Drawer title={`元数据浏览 - ${metaDrawer.ds?.name || ""}`} open={metaDrawer.open} onClose={() => setMetaDrawer({ open: false, tables: [] })} width={600}>
        {metaDrawer.ds && (
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="类型">{metaDrawer.ds.type?.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="主机">{metaDrawer.ds.host}</Descriptions.Item>
            <Descriptions.Item label="端口">{metaDrawer.ds.port}</Descriptions.Item>
            <Descriptions.Item label="数据库">{metaDrawer.ds.database}</Descriptions.Item>
            <Descriptions.Item label="用户">{metaDrawer.ds.username}</Descriptions.Item>
            <Descriptions.Item label="Glue连接">{metaDrawer.ds.glueConnectionName || "无"}</Descriptions.Item>
          </Descriptions>
        )}
        <h4>表列表 ({metaDrawer.tables.length} 张表)</h4>
        <Collapse items={metaDrawer.tables.map((t: any) => ({
          key: t.name,
          label: <Space><TableOutlined /><b>{t.name}</b><Tag>{t.columns?.length || 0} 字段</Tag>{t.partitionKeys?.length > 0 && <Tag color="orange">{t.partitionKeys.length} 分区键</Tag>}</Space>,
          children: (
            <Table size="small" pagination={false} dataSource={t.columns?.map((c: any, i: number) => ({ ...c, key: i }))}
              columns={[
                { title: "字段名", dataIndex: "name", key: "name", render: (v: string) => <code>{v}</code> },
                { title: "类型", dataIndex: "type", key: "type", render: (v: string) => <Tag>{v}</Tag> },
                { title: "备注", dataIndex: "comment", key: "comment" },
              ]}
            />
          ),
        }))} />
      </Drawer>
    </div>
  );
}
