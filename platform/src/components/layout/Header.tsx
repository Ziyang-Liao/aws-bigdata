"use client";

import React from "react";
import { Layout, Avatar, Dropdown } from "antd";
import { UserOutlined, LogoutOutlined, LoginOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";

const { Header: AntHeader } = Layout;

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const items = user
    ? [
        { key: "user", label: user.getUsername(), disabled: true },
        { key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: () => { logout(); router.push("/login"); } },
      ]
    : [
        { key: "login", icon: <LoginOutlined />, label: "登录", onClick: () => router.push("/login") },
      ];

  return (
    <AntHeader style={{ background: "#fff", padding: "0 24px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
      <Dropdown menu={{ items }}>
        <Avatar icon={<UserOutlined />} style={{ cursor: "pointer" }} />
      </Dropdown>
    </AntHeader>
  );
}
