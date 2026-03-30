"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Popconfirm, Badge } from "antd";
import { PlusOutlined, UserOutlined } from "@ant-design/icons";

const roleColor: Record<string, string> = { Admin: "red", Developer: "blue", Viewer: "default" };

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const d = await res.json();
      setUsers(d.success ? d.data : d);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const d = await res.json();
    d.success !== false ? (message.success("用户已创建"), setCreateOpen(false), form.resetFields(), fetchUsers()) : message.error(d.error?.message);
  };

  const handleAction = async (username: string, action: string, role?: string) => {
    await fetch("/api/admin/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, action, role }) });
    message.success("操作成功");
    fetchUsers();
  };

  const columns = [
    { title: "用户名", dataIndex: "username", render: (v: string) => <Space><UserOutlined /><b>{v}</b></Space> },
    { title: "邮箱", dataIndex: "email" },
    { title: "角色", dataIndex: "role", render: (v: string, r: any) => (
      <Select size="small" value={v} style={{ width: 110 }} onChange={(role) => handleAction(r.username, "changeRole", role)}
        options={[{ label: "Admin", value: "Admin" }, { label: "Developer", value: "Developer" }, { label: "Viewer", value: "Viewer" }]} />
    )},
    { title: "状态", key: "status", render: (_: any, r: any) => (
      <Badge status={r.enabled ? "success" : "error"} text={r.enabled ? "启用" : "禁用"} />
    )},
    { title: "创建时间", dataIndex: "createdAt", render: (v: string) => v?.slice(0, 19).replace("T", " ") },
    { title: "操作", key: "action", render: (_: any, r: any) => (
      <Space>
        {r.enabled ? (
          <Popconfirm title="确认禁用？" onConfirm={() => handleAction(r.username, "disable")}><a style={{ color: "red" }}>禁用</a></Popconfirm>
        ) : (
          <a onClick={() => handleAction(r.username, "enable")}>启用</a>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><UserOutlined /> 用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建用户</Button>
      </div>
      <Table columns={columns} dataSource={users} rowKey="username" loading={loading} />

      <Modal title="创建用户" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label="角色" initialValue="Developer">
            <Select options={[{ label: "Admin - 管理员", value: "Admin" }, { label: "Developer - 开发者", value: "Developer" }, { label: "Viewer - 只读", value: "Viewer" }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
