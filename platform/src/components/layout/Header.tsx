"use client";

import React from "react";
import { Layout, Avatar, Dropdown } from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";

const { Header: AntHeader } = Layout;

export default function Header() {
  const items = [
    { key: "logout", icon: <LogoutOutlined />, label: "退出登录" },
  ];

  return (
    <AntHeader style={{ background: "#fff", padding: "0 24px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
      <Dropdown menu={{ items }}>
        <Avatar icon={<UserOutlined />} style={{ cursor: "pointer" }} />
      </Dropdown>
    </AntHeader>
  );
}
