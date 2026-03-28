"use client";

import { Button, Form, Input, InputNumber, Select, Space, message } from "antd";
import { useState } from "react";
import { ApiOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import type { DataSource } from "@/types/datasource";

const dbTypes = [
  { label: "MySQL", value: "mysql" },
  { label: "PostgreSQL", value: "postgresql" },
  { label: "Oracle", value: "oracle" },
  { label: "SQL Server", value: "sqlserver" },
];

const defaultPorts: Record<string, number> = {
  mysql: 3306, postgresql: 5432, oracle: 1521, sqlserver: 1433,
};

interface Props {
  initialValues?: DataSource | null;
  onSubmit: (values: Record<string, unknown>) => void;
}

export default function DataSourceForm({ initialValues, onSubmit }: Props) {
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTypeChange = (type: string) => {
    form.setFieldValue("port", defaultPorts[type]);
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      setTestResult(null);
      const res = await fetch("/api/datasources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) message.success("连接成功");
      else message.error(data.message || "连接失败");
    } catch {
      // validation failed
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues ? {
        name: initialValues.name,
        type: initialValues.type,
        host: initialValues.host,
        port: initialValues.port,
        database: initialValues.database,
        username: initialValues.username,
      } : { type: "mysql", port: 3306 }}
      onFinish={onSubmit}
    >
      <Form.Item name="name" label="数据源名称" rules={[{ required: true, message: "请输入名称" }]}>
        <Input placeholder="例如：业务主库" />
      </Form.Item>
      <Form.Item name="type" label="数据库类型" rules={[{ required: true }]}>
        <Select options={dbTypes} onChange={handleTypeChange} />
      </Form.Item>
      <Space.Compact style={{ width: "100%" }}>
        <Form.Item name="host" label="主机地址" rules={[{ required: true, message: "请输入主机" }]} style={{ flex: 1 }}>
          <Input placeholder="192.168.1.100 或域名" />
        </Form.Item>
        <Form.Item name="port" label="端口" rules={[{ required: true }]} style={{ width: 120 }}>
          <InputNumber style={{ width: "100%" }} />
        </Form.Item>
      </Space.Compact>
      <Form.Item name="database" label="数据库名" rules={[{ required: true, message: "请输入数据库名" }]}>
        <Input placeholder="database_name" />
      </Form.Item>
      <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
        <Input placeholder="用户名" />
      </Form.Item>
      <Form.Item name="password" label="密码" rules={[{ required: !initialValues, message: "请输入密码" }]}>
        <Input.Password placeholder="密码" />
      </Form.Item>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <Button
          icon={testResult?.success ? <CheckCircleOutlined /> : testResult ? <CloseCircleOutlined /> : <ApiOutlined />}
          onClick={handleTest}
          loading={testing}
          style={testResult ? { color: testResult.success ? "#52c41a" : "#ff4d4f" } : {}}
        >
          测试连接
        </Button>
        <Button type="primary" htmlType="submit">
          {initialValues ? "更新" : "创建"}
        </Button>
      </div>
    </Form>
  );
}
