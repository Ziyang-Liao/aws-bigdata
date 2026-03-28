"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, theme, Avatar, Dropdown } from "antd";
import {
  DatabaseOutlined,
  SwapOutlined,
  ApartmentOutlined,
  ClockCircleOutlined,
  ConsoleSqlOutlined,
  DashboardOutlined,
  LockOutlined,
  AuditOutlined,
  NodeIndexOutlined,
  UserOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <DashboardOutlined />, label: "监控大盘" },
  { key: "/datasources", icon: <DatabaseOutlined />, label: "数据源管理" },
  { key: "/sync", icon: <SwapOutlined />, label: "数据同步" },
  { key: "/workflow", icon: <ApartmentOutlined />, label: "ETL 编排" },
  { key: "/schedule", icon: <ClockCircleOutlined />, label: "调度管理" },
  { key: "/redshift", icon: <ConsoleSqlOutlined />, label: "Redshift 任务" },
  { type: "divider" },
  { key: "/permissions", icon: <LockOutlined />, label: "权限管控" },
  { key: "/audit", icon: <AuditOutlined />, label: "操作审计" },
  { key: "/governance", icon: <NodeIndexOutlined />, label: "数据治理" },
];

const userMenuItems: MenuProps["items"] = [
  { key: "profile", icon: <UserOutlined />, label: "个人信息" },
  { type: "divider" },
  { key: "logout", icon: <LogoutOutlined />, label: "退出登录" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { token } = theme.useToken();

  const selectedKey = "/" + (pathname.split("/")[1] || "");

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
      >
        <div
          style={{
            height: 48,
            margin: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: collapsed ? 14 : 16,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {collapsed ? "BGP" : "大数据治理平台"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: "0 24px",
            background: token.colorBgContainer,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Avatar icon={<UserOutlined />} style={{ cursor: "pointer" }} />
          </Dropdown>
        </Header>
        <Content style={{ margin: 16 }}>
          <div
            style={{
              padding: 24,
              background: token.colorBgContainer,
              borderRadius: token.borderRadiusLG,
              minHeight: "calc(100vh - 112px)",
            }}
          >
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
