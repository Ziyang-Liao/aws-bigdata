"use client";

import React, { useState } from "react";
import { Form, Input, Button, Card, message, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success("登录成功");
      router.push("/");
    } catch (err: any) {
      message.error(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f0f2f5" }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={3} style={{ textAlign: "center" }}>大数据治理平台</Typography.Title>
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">登录</Button>
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ display: "block", textAlign: "center" }}>
          未配置 Cognito 时可直接访问各页面
        </Typography.Text>
      </Card>
    </div>
  );
}
