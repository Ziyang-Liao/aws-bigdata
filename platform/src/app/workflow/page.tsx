"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Popconfirm, message, Modal, Input, Form, Select, Card } from "antd";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import type { Workflow } from "@/types/workflow";

const statusMap: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  active: { color: "processing", text: "已发布" },
  paused: { color: "warning", text: "已暂停" },
  error: { color: "error", text: "异常" },
};

const runStatusMap: Record<string, { color: string; text: string }> = {
  running: { color: "processing", text: "运行中" },
  succeeded: { color: "success", text: "成功" },
  failed: { color: "error", text: "失败" },
};

export default function WorkflowPage() {
  const [data, setData] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const router = useRouter();
  const [filters, setFilters] = useState({ name: "", status: "", cron: "" });

  const fetchData = async (f?: typeof filters) => {
    setLoading(true);
    try {
      const cur = f || filters;
      const params = new URLSearchParams();
      if (cur.name) params.set("name", cur.name);
      if (cur.status) params.set("status", cur.status);
      if (cur.cron) params.set("cron", cur.cron);
      const qs = params.toString();
      const res = await fetch(`/api/workflow${qs ? `?${qs}` : ""}`);
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
    { title: "工作流名称", dataIndex: "name", key: "name",
      render: (v: string, r: any) => <a href={`/workflow/${r.workflowId}`}><b>{v}</b></a> },
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
    {
      title: "最近运行", dataIndex: "lastRunStatus", key: "lastRunStatus",
      render: (v: string) => v ? <Tag color={runStatusMap[v]?.color}>{runStatusMap[v]?.text || v}</Tag> : <Tag>未运行</Tag>,
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
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建工作流</Button>
        </Space>
      </div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="工作流名称" prefix={<SearchOutlined />} value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} onPressEnter={() => fetchData()} allowClear style={{ width: 200 }} />
          <Select placeholder="状态" value={filters.status || undefined} onChange={(v) => { const f = { ...filters, status: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 120 }}
            options={[{ label: "草稿", value: "draft" }, { label: "已发布", value: "active" }, { label: "已暂停", value: "paused" }, { label: "异常", value: "error" }]} />
          <Select placeholder="调度" value={filters.cron || undefined} onChange={(v) => { const f = { ...filters, cron: v || "" }; setFilters(f); fetchData(f); }} allowClear style={{ width: 130 }}
            options={[{ label: "已配置", value: "configured" }, { label: "未配置", value: "none" }]} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData()}>搜索</Button>
          <Button onClick={() => { const f = { name: "", status: "", cron: "" }; setFilters(f); fetchData(f); }}>重置</Button>
        </Space>
      </Card>
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
