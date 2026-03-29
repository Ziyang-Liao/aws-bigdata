"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useState, useEffect } from "react";
import { Steps, Button, Form, Input, Select, Space, Card, message, Tag, Transfer } from "antd";
import { useRouter } from "next/navigation";
import type { DataSource } from "@/types/datasource";

const { Option } = Select;

export default function NewSyncPage() {
  const [current, setCurrent] = useState(0);
  const [form] = Form.useForm();
  const [datasources, setDatasources] = useState<DataSource[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/datasources").then(r => r.json()).then(setDatasources);
  }, []);

  const steps = [
    { title: "基本信息" },
    { title: "源端配置" },
    { title: "目标配置" },
    { title: "高级选项" },
  ];

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload = {
        name: values.name,
        datasourceId: values.datasourceId,
        sourceDatabase: values.sourceDatabase,
        sourceTables: selectedTables,
        targetType: values.targetType,
        syncMode: values.syncMode,
        writeMode: values.writeMode,
        channel: values.channel,
        mergeKeys: values.mergeKeys?.split(",").map((s: string) => s.trim()).filter(Boolean) || [],
        s3Config: values.targetType !== "redshift" ? {
          tableBucketArn: values.tableBucketArn || "",
          namespace: values.namespace || "default",
          partitionFields: values.partitionFields?.split(",").map((f: string) => ({ field: f.trim(), type: "string" })) || [],
        } : null,
        redshiftConfig: values.targetType !== "s3-tables" ? {
          workgroupName: values.workgroupName || "",
          database: values.redshiftDatabase || "",
          schema: values.redshiftSchema || "public",
          sortKeys: values.sortKeys?.split(",").map((s: string) => s.trim()).filter(Boolean) || [],
          distKey: values.distKey || "",
          distStyle: values.distStyle || "auto",
        } : null,
      };

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        message.success("同步任务创建成功");
        router.push("/sync");
      } else {
        message.error("创建失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 模拟表列表（实际应从源库动态拉取）
  const mockTables = ["users", "orders", "products", "payments", "logs"].map(t => ({ key: t, title: t }));

  return (
    <AppLayout>
      <h2 style={{ marginBottom: 24 }}>新建同步任务</h2>
      <Steps current={current} items={steps} style={{ marginBottom: 32 }} />

      <Form form={form} layout="vertical" initialValues={{ targetType: "s3-tables", syncMode: "full", writeMode: "append", channel: "glue", distStyle: "auto" }}>
        <Card style={{ display: current === 0 ? "block" : "none" }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: "请输入任务名称" }]}>
            <Input placeholder="例如：用户表同步到数据湖" />
          </Form.Item>
          <Form.Item name="channel" label="同步通道">
            <Select>
              <Option value="glue">Glue ETL（批量同步，支持所有 JDBC 源）</Option>
              <Option value="zero-etl">Zero-ETL（近实时，支持 MySQL/PG/Oracle）</Option>
              <Option value="dms">DMS CDC（增量同步，支持最广数据源）</Option>
            </Select>
          </Form.Item>
          <Form.Item name="syncMode" label="同步模式">
            <Select>
              <Option value="full">全量同步</Option>
              <Option value="incremental">增量同步 (CDC)</Option>
            </Select>
          </Form.Item>
        </Card>

        <Card style={{ display: current === 1 ? "block" : "none" }}>
          <Form.Item name="datasourceId" label="选择数据源" rules={[{ required: true, message: "请选择数据源" }]}>
            <Select placeholder="选择已配置的数据源">
              {datasources.map(ds => (
                <Option key={ds.datasourceId} value={ds.datasourceId}>
                  <Tag color="blue">{ds.type}</Tag> {ds.name} ({ds.host})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="sourceDatabase" label="源数据库" rules={[{ required: true }]}>
            <Input placeholder="数据库名" />
          </Form.Item>
          <Form.Item label="选择同步表">
            <Transfer
              dataSource={mockTables}
              targetKeys={selectedTables}
              onChange={(keys) => setSelectedTables(keys as string[])}
              render={item => item.title}
              titles={["可选表", "已选表"]}
              listStyle={{ width: 240, height: 240 }}
            />
          </Form.Item>
        </Card>

        <Card style={{ display: current === 2 ? "block" : "none" }}>
          <Form.Item name="targetType" label="目标类型">
            <Select>
              <Option value="s3-tables">S3 Tables (Iceberg)</Option>
              <Option value="redshift">Redshift</Option>
              <Option value="both">S3 Tables + Redshift</Option>
            </Select>
          </Form.Item>
          <Form.Item name="writeMode" label="写入模式">
            <Select>
              <Option value="append">Append（追加）</Option>
              <Option value="overwrite">Overwrite（覆盖）</Option>
              <Option value="merge">Merge / Upsert（合并更新）</Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.writeMode !== cur.writeMode}>
            {({ getFieldValue }) => getFieldValue("writeMode") === "merge" && (
              <Form.Item name="mergeKeys" label="Merge 主键（逗号分隔）">
                <Input placeholder="id,date" />
              </Form.Item>
            )}
          </Form.Item>
        </Card>

        <Card style={{ display: current === 3 ? "block" : "none" }}>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.targetType !== cur.targetType}>
            {({ getFieldValue }) => {
              const target = getFieldValue("targetType");
              return (
                <>
                  {target !== "redshift" && (
                    <>
                      <h4>S3 Tables 配置</h4>
                      <Form.Item name="tableBucketArn" label="Table Bucket ARN">
                        <Input placeholder="arn:aws:s3tables:us-east-1:123456:bucket/my-bucket" />
                      </Form.Item>
                      <Form.Item name="namespace" label="Namespace">
                        <Input placeholder="default" />
                      </Form.Item>
                      <Form.Item name="partitionFields" label="分区字段（逗号分隔）">
                        <Input placeholder="year,month,day" />
                      </Form.Item>
                    </>
                  )}
                  {target !== "s3-tables" && (
                    <>
                      <h4>Redshift 配置</h4>
                      <Form.Item name="workgroupName" label="Workgroup">
                        <Input placeholder="default-workgroup" />
                      </Form.Item>
                      <Form.Item name="redshiftDatabase" label="数据库">
                        <Input placeholder="dev" />
                      </Form.Item>
                      <Form.Item name="redshiftSchema" label="Schema">
                        <Input placeholder="public" />
                      </Form.Item>
                      <Form.Item name="sortKeys" label="排序键 SORTKEY（逗号分隔）">
                        <Input placeholder="created_at,id" />
                      </Form.Item>
                      <Form.Item name="distKey" label="分布键 DISTKEY">
                        <Input placeholder="user_id" />
                      </Form.Item>
                      <Form.Item name="distStyle" label="分布方式">
                        <Select>
                          <Option value="auto">AUTO</Option>
                          <Option value="key">KEY</Option>
                          <Option value="even">EVEN</Option>
                          <Option value="all">ALL</Option>
                        </Select>
                      </Form.Item>
                    </>
                  )}
                </>
              );
            }}
          </Form.Item>
        </Card>
      </Form>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}>
        <Button disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>上一步</Button>
        <Space>
          <Button onClick={() => router.push("/sync")}>取消</Button>
          {current < steps.length - 1 ? (
            <Button type="primary" onClick={() => setCurrent(c => c + 1)}>下一步</Button>
          ) : (
            <Button type="primary" loading={submitting} onClick={handleSubmit}>创建任务</Button>
          )}
        </Space>
      </div>
    </AppLayout>
  );
}
