"use client";

import React, { useEffect, useState } from "react";
import { Card, Col, Row, Statistic } from "antd";
import { DatabaseOutlined, SyncOutlined, ApartmentOutlined, CheckCircleOutlined } from "@ant-design/icons";

function extract(d: any) { return Array.isArray(d) ? d : d?.data || d || []; }

export default function HomePage() {
  const [stats, setStats] = useState({ datasources: 0, syncTasks: 0, workflows: 0, running: 0 });

  useEffect(() => {
    Promise.all([
      fetch("/api/datasources").then((r) => r.json()).then(extract),
      fetch("/api/sync").then((r) => r.json()).then(extract),
      fetch("/api/workflow").then((r) => r.json()).then(extract),
      fetch("/api/monitor/runs?status=running").then((r) => r.json()),
    ]).then(([ds, sync, wf, runData]) => {
      setStats({
        datasources: ds.length,
        syncTasks: sync.length,
        workflows: wf.length,
        running: runData.total || 0,
      });
    });
  }, []);

  return (
    <div>
      <h2>总览</h2>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="数据源" value={stats.datasources} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="同步任务" value={stats.syncTasks} prefix={<SyncOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="工作流" value={stats.workflows} prefix={<ApartmentOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="运行中" value={stats.running} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#3f8600" }} /></Card></Col>
      </Row>
    </div>
  );
}
