"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Popconfirm, message } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { DataSource } from "@/types/datasource";
import DataSourceModal from "./DataSourceModal";

const statusColor: Record<string, string> = { active: "green", inactive: "default", error: "red" };

export default function DatasourcesPage() {
  const [data, setData] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataSource | undefined>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/datasources");
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasources/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchData();
  };

  const columns = [
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "类型", dataIndex: "type", key: "type", render: (v: string) => v?.toUpperCase() },
    { title: "主机", dataIndex: "host", key: "host" },
    { title: "端口", dataIndex: "port", key: "port" },
    { title: "数据库", dataIndex: "database", key: "database" },
    { title: "状态", dataIndex: "status", key: "status", render: (v: string) => <Tag color={statusColor[v]}>{v}</Tag> },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    {
      title: "操作", key: "action",
      render: (_: any, record: DataSource) => (
        <Space>
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
        <h2 style={{ margin: 0 }}>数据源管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setModalOpen(true); }}>
            新建数据源
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="datasourceId" loading={loading} />
      <DataSourceModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); fetchData(); }}
      />
    </div>
  );
}
