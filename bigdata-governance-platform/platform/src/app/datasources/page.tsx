"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { Button, Table, Space, Modal, message, Tag, Popconfirm } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { DataSource } from "@/types/datasource";
import DataSourceForm from "@/components/datasource/DataSourceForm";

const typeColors: Record<string, string> = {
  mysql: "blue", postgresql: "cyan", oracle: "orange", sqlserver: "purple",
};

export default function DatasourcesPage() {
  const [list, setList] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataSource | null>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/datasources");
      setList(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasources/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchList();
  };

  const handleSave = async (values: Record<string, unknown>) => {
    const url = editing ? `/api/datasources/${editing.datasourceId}` : "/api/datasources";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (res.ok) {
      message.success(editing ? "已更新" : "已创建");
      setModalOpen(false);
      setEditing(null);
      fetchList();
    } else {
      message.error("操作失败");
    }
  };

  const columns = [
    { title: "名称", dataIndex: "name", key: "name" },
    {
      title: "类型", dataIndex: "type", key: "type",
      render: (t: string) => <Tag color={typeColors[t]}>{t.toUpperCase()}</Tag>,
    },
    { title: "主机", dataIndex: "host", key: "host" },
    { title: "端口", dataIndex: "port", key: "port" },
    { title: "数据库", dataIndex: "database", key: "database" },
    {
      title: "状态", dataIndex: "status", key: "status",
      render: (s: string) => <Tag color={s === "active" ? "green" : "red"}>{s}</Tag>,
    },
    {
      title: "操作", key: "action",
      render: (_: unknown, record: DataSource) => (
        <Space>
          <a onClick={() => { setEditing(record); setModalOpen(true); }}>编辑</a>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.datasourceId)}>
            <a style={{ color: "#ff4d4f" }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>数据源管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }}>
            新建数据源
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={list} rowKey="datasourceId" loading={loading} />
      <Modal
        title={editing ? "编辑数据源" : "新建数据源"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        footer={null}
        destroyOnClose
        width={560}
      >
        <DataSourceForm initialValues={editing} onSubmit={handleSave} />
      </Modal>
    </AppLayout>
  );
}
