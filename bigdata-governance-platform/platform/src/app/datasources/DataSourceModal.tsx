"use client";

import React, { useState } from "react";
import { Modal, Form, Input, InputNumber, Select, Button, message } from "antd";
import { DS_TYPE_OPTIONS, type DataSource } from "@/types/datasource";

interface Props {
  open: boolean;
  editing?: DataSource;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DataSourceModal({ open, editing, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const isEdit = !!editing;

  const handleTypeChange = (type: string) => {
    const opt = DS_TYPE_OPTIONS.find((o) => o.value === type);
    if (opt && !form.getFieldValue("port")) form.setFieldValue("port", opt.defaultPort);
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const res = await fetch("/api/datasources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      data.success ? message.success("连接成功") : message.error(data.message || "连接失败");
    } catch {
      message.error("请先填写完整信息");
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const url = isEdit ? `/api/datasources/${editing.datasourceId}` : "/api/datasources";
      const method = isEdit ? "PUT" : "POST";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      message.success(isEdit ? "已更新" : "已创建");
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? "编辑数据源" : "新建数据源"}
      open={open}
      onCancel={onClose}
      afterOpenChange={(open) => { if (open) form.setFieldsValue(editing || {}); else form.resetFields(); }}
      footer={[
        <Button key="test" onClick={handleTest} loading={testing}>测试连接</Button>,
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="submit" type="primary" onClick={handleSubmit} loading={saving}>保存</Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="数据源名称" rules={[{ required: true }]}>
          <Input placeholder="例如：业务主库" />
        </Form.Item>
        <Form.Item name="type" label="数据库类型" rules={[{ required: true }]}>
          <Select options={DS_TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))} onChange={handleTypeChange} />
        </Form.Item>
        <Form.Item name="host" label="主机地址" rules={[{ required: true }]}>
          <Input placeholder="例如：db.example.com" />
        </Form.Item>
        <Form.Item name="port" label="端口" rules={[{ required: true }]}>
          <InputNumber style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="database" label="数据库名" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
