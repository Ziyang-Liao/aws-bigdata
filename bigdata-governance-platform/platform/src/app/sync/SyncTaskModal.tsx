"use client";

import React, { useEffect, useState } from "react";
import { Modal, Form, Input, Select, Steps, InputNumber, Space, Button, Table, Switch, Checkbox, Tag, Divider, Radio, Tooltip } from "antd";
import { MinusCircleOutlined, PlusOutlined, SwapOutlined, InfoCircleOutlined } from "@ant-design/icons";
import type { SyncTask } from "@/types/sync-task";
import type { DataSource } from "@/types/datasource";

interface Props { open: boolean; editing?: SyncTask; onClose: () => void; onSuccess: () => void; }

export default function SyncTaskModal({ open, editing, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, any[]>>({});
  const [saving, setSaving] = useState(false);
  const [targetType, setTargetType] = useState("");
  const isEdit = !!editing;

  useEffect(() => {
    if (open) fetch("/api/datasources").then((r) => r.json()).then(setDataSources);
  }, [open]);

  const onDatasourceChange = async (dsId: string) => {
    const ds = dataSources.find((d) => d.datasourceId === dsId);
    if (!ds) return;
    const res = await fetch(`/api/datasources/${dsId}/tables?database=${ds.database}`);
    const data = await res.json();
    setTables(data);
    // Auto-generate field mappings
    const mappings: Record<string, any[]> = {};
    data.forEach((t: any) => {
      mappings[t.name] = t.columns?.map((c: any) => ({ source: c.name, target: c.name, type: c.type, include: true })) || [];
    });
    setFieldMappings(mappings);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    values.sourceTables = selectedTables;
    values.fieldMappings = {};
    selectedTables.forEach((t) => {
      values.fieldMappings[t] = fieldMappings[t]?.filter((f) => f.include) || [];
    });
    setSaving(true);
    try {
      const url = isEdit ? `/api/sync/${editing.taskId}` : "/api/sync";
      await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      onSuccess();
    } finally { setSaving(false); }
  };

  const STEPS = [
    { title: "基本配置" },
    { title: "源端 · 选表" },
    { title: "字段映射" },
    { title: "目标配置" },
    { title: "调度设置" },
  ];

  return (
    <Modal title={isEdit ? "编辑同步任务" : "新建同步任务"} open={open} width={860} onCancel={onClose} onOk={handleSubmit} confirmLoading={saving}
      afterOpenChange={(o) => { if (o) { form.setFieldsValue(editing || {}); setStep(0); setTargetType(editing?.targetType || ""); setSelectedTables(editing?.sourceTables || []); } else { form.resetFields(); setTables([]); setFieldMappings({}); setSelectedTables([]); } }}>
      <Steps current={step} size="small" style={{ marginBottom: 24 }} items={STEPS} />
      <Form form={form} layout="vertical" style={{ minHeight: 360 }}>

        {step === 0 && (<>
          <Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input placeholder="例如：电商用户表全量同步" /></Form.Item>
          <Form.Item name="channel" label="同步通道" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="glue"><Tooltip title="通用 ETL，支持所有 JDBC 源">Glue ETL</Tooltip></Radio.Button>
              <Radio.Button value="zero-etl"><Tooltip title="近实时，仅支持 MySQL/Aurora → Redshift">Zero-ETL</Tooltip></Radio.Button>
              <Radio.Button value="dms"><Tooltip title="CDC 增量同步，支持持续复制">DMS CDC</Tooltip></Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Space size={24}>
            <Form.Item name="syncMode" label="同步模式" rules={[{ required: true }]}>
              <Select style={{ width: 200 }} options={[{ label: "全量同步", value: "full" }, { label: "增量同步 (CDC)", value: "incremental" }]} />
            </Form.Item>
            <Form.Item name="writeMode" label="写入模式" rules={[{ required: true }]}>
              <Select style={{ width: 200 }} options={[
                { label: "覆盖 (Overwrite)", value: "overwrite" },
                { label: "追加 (Append)", value: "append" },
                { label: "合并 (Merge/Upsert)", value: "merge" },
              ]} />
            </Form.Item>
          </Space>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.writeMode !== cur.writeMode}>
            {({ getFieldValue }) => getFieldValue("writeMode") === "merge" && (
              <Form.Item name="mergeKeys" label="Merge 主键（逗号分隔）"><Input placeholder="id,order_id" /></Form.Item>
            )}
          </Form.Item>
        </>)}

        {step === 1 && (<>
          <Form.Item name="datasourceId" label="选择数据源" rules={[{ required: true }]}>
            <Select onChange={onDatasourceChange} options={dataSources.map((ds) => ({
              label: <Space>{ds.type === "mysql" ? "🐬" : ds.type === "postgresql" ? "🐘" : "🔶"}<span>{ds.name}</span><Tag>{ds.host}:{ds.port}/{ds.database}</Tag></Space>,
              value: ds.datasourceId,
            }))} />
          </Form.Item>
          <Form.Item name="sourceDatabase" label="源数据库"><Input placeholder="自动从数据源获取" /></Form.Item>
          <Divider>选择同步表</Divider>
          {tables.length > 0 ? (
            <Checkbox.Group value={selectedTables} onChange={(v) => setSelectedTables(v as string[])}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {tables.map((t) => (
                  <div key={t.name} style={{ padding: "8px 12px", border: "1px solid #f0f0f0", borderRadius: 6, background: selectedTables.includes(t.name) ? "#e6f4ff" : "#fff" }}>
                    <Checkbox value={t.name}>
                      <Space><b>{t.name}</b><Tag>{t.columns?.length} 字段</Tag>
                        {t.columns?.slice(0, 4).map((c: any) => <Tag key={c.name} style={{ fontSize: 11 }}>{c.name}: {c.type}</Tag>)}
                        {t.columns?.length > 4 && <Tag>+{t.columns.length - 4}</Tag>}
                      </Space>
                    </Checkbox>
                  </div>
                ))}
              </Space>
            </Checkbox.Group>
          ) : <div style={{ color: "#999", textAlign: "center", padding: 40 }}>请先选择数据源</div>}
        </>)}

        {step === 2 && (<>
          <div style={{ marginBottom: 8, color: "#666" }}><SwapOutlined /> 字段映射 — 勾选要同步的字段，可修改目标字段名</div>
          {selectedTables.map((tableName) => (
            <div key={tableName} style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "8px 0" }}>📋 {tableName}</h4>
              <Table size="small" pagination={false} dataSource={fieldMappings[tableName]?.map((f, i) => ({ ...f, key: i }))}
                columns={[
                  { title: "同步", dataIndex: "include", width: 60, render: (_: any, r: any, i: number) => (
                    <Switch size="small" checked={r.include} onChange={(v) => {
                      const m = { ...fieldMappings };
                      m[tableName] = [...m[tableName]];
                      m[tableName][i] = { ...m[tableName][i], include: v };
                      setFieldMappings(m);
                    }} />
                  )},
                  { title: "源字段", dataIndex: "source", render: (v: string) => <code>{v}</code> },
                  { title: "类型", dataIndex: "type", render: (v: string) => <Tag>{v}</Tag> },
                  { title: "→", width: 30, render: () => "→" },
                  { title: "目标字段", dataIndex: "target", render: (_: any, r: any, i: number) => (
                    <Input size="small" value={r.target} onChange={(e) => {
                      const m = { ...fieldMappings };
                      m[tableName] = [...m[tableName]];
                      m[tableName][i] = { ...m[tableName][i], target: e.target.value };
                      setFieldMappings(m);
                    }} />
                  )},
                ]}
              />
            </div>
          ))}
          {selectedTables.length === 0 && <div style={{ color: "#999", textAlign: "center", padding: 40 }}>请先在上一步选择表</div>}
        </>)}

        {step === 3 && (<>
          <Form.Item name="targetType" label="目标类型" rules={[{ required: true }]}>
            <Radio.Group onChange={(e) => setTargetType(e.target.value)}>
              <Radio.Button value="s3-tables">S3 数据湖 (Parquet)</Radio.Button>
              <Radio.Button value="redshift">Redshift</Radio.Button>
              <Radio.Button value="both">S3 + Redshift</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {(targetType === "s3-tables" || targetType === "both") && (<>
            <Divider>S3 数据湖配置</Divider>
            <Space size={16}>
              <Form.Item name={["s3Config", "bucket"]} label="S3 Bucket"><Input placeholder="bgp-datalake-470377450205" style={{ width: 280 }} /></Form.Item>
              <Form.Item name={["s3Config", "prefix"]} label="路径前缀"><Input placeholder="ecommerce/" style={{ width: 200 }} /></Form.Item>
            </Space>
            <Form.Item name={["s3Config", "format"]} label="文件格式" initialValue="parquet">
              <Select style={{ width: 200 }} options={[{ label: "Parquet", value: "parquet" }, { label: "ORC", value: "orc" }, { label: "CSV", value: "csv" }, { label: "JSON", value: "json" }]} />
            </Form.Item>
            <Form.List name={["s3Config", "partitionFields"]}>
              {(fields, { add, remove }) => (<>
                <label style={{ fontWeight: 500 }}><InfoCircleOutlined /> 分区配置</label>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>按字段分区可提升查询性能，常用日期字段分区</div>
                {fields.map(({ key, name }) => (
                  <Space key={key} align="baseline" style={{ display: "flex", marginBottom: 8 }}>
                    <Form.Item name={[name, "field"]} noStyle><Input placeholder="字段名 (如 order_date)" style={{ width: 200 }} /></Form.Item>
                    <Form.Item name={[name, "type"]} noStyle>
                      <Select style={{ width: 140 }} placeholder="分区类型" options={[
                        { label: "📅 日期 (yyyy-MM-dd)", value: "date" },
                        { label: "📅 年月 (yyyy-MM)", value: "year-month" },
                        { label: "🔢 数值范围", value: "number" },
                        { label: "🔤 字符串", value: "string" },
                      ]} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginBottom: 16 }}>添加分区字段</Button>
              </>)}
            </Form.List>
          </>)}

          {(targetType === "redshift" || targetType === "both") && (<>
            <Divider>Redshift 配置</Divider>
            <Space size={16}>
              <Form.Item name={["redshiftConfig", "workgroupName"]} label="Workgroup" initialValue="bgp-workgroup">
                <Input style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name={["redshiftConfig", "database"]} label="Database" initialValue="dev">
                <Input style={{ width: 150 }} />
              </Form.Item>
              <Form.Item name={["redshiftConfig", "schema"]} label="Schema" initialValue="public">
                <Input style={{ width: 150 }} />
              </Form.Item>
            </Space>
            <Space size={16}>
              <Form.Item name={["redshiftConfig", "distStyle"]} label="分布策略">
                <Select style={{ width: 150 }} options={[
                  { label: "AUTO (推荐)", value: "auto" }, { label: "KEY", value: "key" },
                  { label: "EVEN", value: "even" }, { label: "ALL", value: "all" },
                ]} />
              </Form.Item>
              <Form.Item name={["redshiftConfig", "distKey"]} label="分布键 (DISTKEY)">
                <Input placeholder="主键字段" style={{ width: 180 }} />
              </Form.Item>
            </Space>
            <Form.Item name={["redshiftConfig", "sortKeys"]} label="排序键 (SORTKEY，逗号分隔)">
              <Input placeholder="order_date,customer_id" />
            </Form.Item>
          </>)}
        </>)}

        {step === 4 && (<>
          <Form.Item name="scheduleEnabled" label="启用调度" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scheduleEnabled !== cur.scheduleEnabled}>
            {({ getFieldValue }) => getFieldValue("scheduleEnabled") && (<>
              <Form.Item name="cronExpression" label="Cron 表达式">
                <Input placeholder="0 2 * * *" addonAfter={
                  <Select style={{ width: 140 }} placeholder="快捷选择" onChange={(v) => form.setFieldValue("cronExpression", v)} options={[
                    { label: "每小时", value: "0 * * * *" },
                    { label: "每天凌晨2点", value: "0 2 * * *" },
                    { label: "每天凌晨6点", value: "0 6 * * *" },
                    { label: "每周一凌晨", value: "0 0 * * 1" },
                    { label: "每月1号", value: "0 0 1 * *" },
                  ]} />
                } />
              </Form.Item>
              <Form.Item name="retryCount" label="失败重试次数" initialValue={0}>
                <InputNumber min={0} max={5} />
              </Form.Item>
              <Form.Item name="timeout" label="超时时间（秒）" initialValue={3600}>
                <InputNumber min={60} max={86400} />
              </Form.Item>
            </>)}
          </Form.Item>
        </>)}
      </Form>

      <div style={{ textAlign: "right", marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
        {step > 0 && <Button onClick={() => setStep(step - 1)} style={{ marginRight: 8 }}>上一步</Button>}
        {step < STEPS.length - 1 && <Button type="primary" onClick={() => setStep(step + 1)}>下一步</Button>}
      </div>
    </Modal>
  );
}
