"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Popconfirm, message, Modal, Input, Form } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import type { Workflow } from "@/types/workflow";

const statusMap: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  active: { color: "success", text: "运行中" },
  paused: { color: "warning", text: "已暂停" },
  error: { color: "error", text: "异常" },
};

export default function WorkflowPage() {
  const [data, setData] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const router = useRouter();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflow");
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    await fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    message.success("已创建");
    setCreateOpen(false);
    form.resetFields();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/workflow/${id}`, { method: "DELETE" });
    message.success("已删除");
    fetchData();
  };

  const columns = [
    { title: "工作流名称", dataIndex: "name", key: "name", render: (v: string) => <b>{v}</b> },
    { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
    {
      title: "节点", key: "nodes",
      render: (_: any, r: Workflow) => {
        const n = r.dagDefinition?.nodes?.length || 0;
        const e = r.dagDefinition?.edges?.length || 0;
        return <Tag>{n} 节点 / {e} 连线</Tag>;
      },
    },
    {
      title: "状态", dataIndex: "status", key: "status",
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>,
    },
    { title: "调度", dataIndex: "cronExpression", key: "cron", render: (v: string) => v || "未配置" },
    { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    {
      title: "操作", key: "action",
      render: (_: any, record: Workflow) => (
        <Space>
          <a onClick={() => router.push(`/workflow/${record.workflowId}`)}>编辑 DAG</a>
          <a onClick={async () => {
            const res = await fetch(`/api/workflow/${record.workflowId}/publish`, { method: "POST" });
            const data = await res.json();
            data.error ? message.error(data.error) : message.success("已发布到 Airflow");
            fetchData();
          }}>发布</a>
          <a onClick={async () => {
            const res = await fetch(`/api/workflow/${record.workflowId}/trigger`, { method: "POST" });
            const data = await res.json();
            data.error ? message.error(data.error) : message.success("已触发运行");
          }}>触发</a>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.workflowId)}>
            <a style={{ color: "red" }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>ETL 编排</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建工作流</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="workflowId" loading={loading} />
      <Modal title="新建工作流" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
