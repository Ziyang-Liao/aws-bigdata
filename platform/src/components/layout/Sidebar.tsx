"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Layout, Menu } from "antd";
import {
  DatabaseOutlined,
  SyncOutlined,
  ApartmentOutlined,
  ClockCircleOutlined,
  ConsoleSqlOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  HomeOutlined,
  UserOutlined,
  SettingOutlined,
} from "@ant-design/icons";

const { Sider } = Layout;

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "首页" },
  { key: "/datasources", icon: <DatabaseOutlined />, label: "数据源管理" },
  { key: "/sync", icon: <SyncOutlined />, label: "数据同步" },
  { key: "/workflow", icon: <ApartmentOutlined />, label: "ETL 编排" },
  { key: "/schedule", icon: <ClockCircleOutlined />, label: "调度管理" },
  { key: "/redshift", icon: <ConsoleSqlOutlined />, label: "Redshift 任务" },
  { key: "/monitor", icon: <DashboardOutlined />, label: "任务监控" },
  { key: "/governance", icon: <SafetyCertificateOutlined />, label: "数据治理" },
  { key: "/openmetadata", icon: <SafetyCertificateOutlined />, label: "数据治理中心" },
  { type: "divider" as const },
  { key: "/admin/users", icon: <UserOutlined />, label: "用户管理" },
  { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      style={{ minHeight: "100vh" }}
    >
      <div style={{ height: 32, margin: 16, color: "#fff", textAlign: "center", fontWeight: "bold", fontSize: collapsed ? 14 : 16 }}>
        {collapsed ? "BGP" : "大数据治理平台"}
      </div>
      <Menu
        theme="dark"
        selectedKeys={[pathname]}
        items={menuItems}
        onClick={({ key }) => router.push(key)}
      />
    </Sider>
  );
}
