"use client";

import React from "react";
import { Drawer, Form, Input, Select } from "antd";
import type { Node } from "reactflow";

interface Props {
  node: Node | null;
  onClose: () => void;
  onChange: (id: string, data: any) => void;
}

export default function NodeConfigPanel({ node, onClose, onChange }: Props) {
  const [form] = Form.useForm();

  if (!node) return null;

  const handleChange = () => {
    const values = form.getFieldsValue();
    onChange(node.id, { ...node.data, ...values });
  };

  return (
    <Drawer title="节点配置" open={!!node} onClose={onClose} width={360}>
      <Form form={form} layout="vertical" initialValues={node.data} onValuesChange={handleChange}>
        <Form.Item name="label" label="节点名称">
          <Input />
        </Form.Item>

        {node.type === "sync" && (
          <Form.Item name="syncTaskId" label="关联同步任务">
            <Input placeholder="同步任务 ID" />
          </Form.Item>
        )}

        {node.type === "sql" && (
          <Form.Item name="sql" label="SQL 语句">
            <Input.TextArea rows={6} placeholder="SELECT ..." />
          </Form.Item>
        )}

        {node.type === "python" && (
          <Form.Item name="script" label="Python 脚本">
            <Input.TextArea rows={6} placeholder="# Python code here" />
          </Form.Item>
        )}

        <Form.Item name="retryCount" label="重试次数" initialValue={0}>
          <Select options={[0, 1, 2, 3].map((n) => ({ label: `${n} 次`, value: n }))} />
        </Form.Item>

        <Form.Item name="timeout" label="超时时间（秒）">
          <Input type="number" placeholder="3600" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
