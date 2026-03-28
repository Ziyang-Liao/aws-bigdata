"use client";

import AppLayout from "@/components/layout/AppLayout";
import { Card, Col, Row, Statistic } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";

export default function DashboardPage() {
  return (
    <AppLayout>
      <h2 style={{ marginBottom: 24 }}>监控大盘</h2>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="数据源" value={0} prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="运行中" value={0} prefix={<SyncOutlined spin />} valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="成功" value={0} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#3f8600" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="失败" value={0} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#cf1322" }} />
          </Card>
        </Col>
      </Row>
    </AppLayout>
  );
}
