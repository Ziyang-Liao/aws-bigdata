"use client";

import React, { useState } from "react";
import { Tabs, Input, Table, Empty, Card } from "antd";
import { SearchOutlined } from "@ant-design/icons";

export default function GovernancePage() {
  const [searchResults] = useState<any[]>([]);
  const omUrl = process.env.NEXT_PUBLIC_OPENMETADATA_URL || "";

  const catalogColumns = [
    { title: "表名", dataIndex: "name", key: "name" },
    { title: "数据库", dataIndex: "database", key: "database" },
    { title: "描述", dataIndex: "description", key: "description" },
    { title: "所有者", dataIndex: "owner", key: "owner" },
  ];

  return (
    <div>
      <h2>数据治理</h2>
      <Tabs items={[
        {
          key: "catalog",
          label: "数据目录",
          children: (
            <div>
              <Input.Search placeholder="搜索数据资产..." enterButton={<><SearchOutlined /> 搜索</>} size="large" style={{ marginBottom: 16 }} />
              {searchResults.length > 0 ? (
                <Table columns={catalogColumns} dataSource={searchResults} rowKey="name" />
              ) : (
                <Empty description="请部署 OpenMetadata 后搜索数据资产" />
              )}
            </div>
          ),
        },
        {
          key: "lineage",
          label: "数据血缘",
          children: <Card><Empty description="部署 OpenMetadata 后可查看列级血缘" /></Card>,
        },
        {
          key: "quality",
          label: "数据质量",
          children: <Card><Empty description="部署 OpenMetadata 后可配置数据质量规则" /></Card>,
        },
        {
          key: "openmetadata",
          label: "OpenMetadata",
          children: omUrl ? (
            <iframe src={omUrl} style={{ width: "100%", height: "80vh", border: "none", borderRadius: 8 }} />
          ) : (
            <Card><Empty description="请配置 NEXT_PUBLIC_OPENMETADATA_URL 环境变量" /></Card>
          ),
        },
      ]} />
    </div>
  );
}
