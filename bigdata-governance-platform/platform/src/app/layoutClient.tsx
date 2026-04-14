"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Layout, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { AuthProvider } from "@/lib/auth/AuthProvider";

const { Content } = Layout;

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <ConfigProvider locale={zhCN}>
      <AuthProvider>
        {isLogin ? (
          children
        ) : (
          <Layout style={{ minHeight: "100vh" }}>
            <Sidebar />
            <Layout>
              <Header />
              <Content style={{ margin: 24, padding: 24, background: "#fff", borderRadius: 8 }}>
                {children}
              </Content>
            </Layout>
          </Layout>
        )}
      </AuthProvider>
    </ConfigProvider>
  );
}
