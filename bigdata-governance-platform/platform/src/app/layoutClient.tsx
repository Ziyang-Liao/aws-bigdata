"use client";

import React from "react";
import { Layout, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

const { Content } = Layout;

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: "100vh" }}>
        <Sidebar />
        <Layout>
          <Header />
          <Content style={{ margin: 24, padding: 24, background: "#fff", borderRadius: 8 }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
