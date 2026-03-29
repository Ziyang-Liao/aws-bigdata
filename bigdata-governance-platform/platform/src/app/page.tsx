"use client";

import { Card, Col, Row, Statistic } from "antd";
import { DatabaseOutlined, SyncOutlined, ApartmentOutlined, CheckCircleOutlined } from "@ant-design/icons";

export default function HomePage() {
  return (
    <div>
      <h2>总览</h2>
      <Row gutter={16}>
        <Col span={6}>
          <Card><Statistic title="数据源" value={0} prefix={<DatabaseOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="同步任务" value={0} prefix={<SyncOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="工作流" value={0} prefix={<ApartmentOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="今日成功" value={0} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#3f8600" }} /></Card>
        </Col>
      </Row>
    </div>
  );
}
