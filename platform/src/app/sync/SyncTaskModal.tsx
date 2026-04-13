"use client";

import React, { useEffect, useState } from "react";
import { Modal, Form, Input, Select, Steps, InputNumber, Space, Button, Table, Switch, Checkbox, Tag, Divider, Radio, Alert, message } from "antd";
import { MinusCircleOutlined, PlusOutlined, SwapOutlined, CheckCircleOutlined, WarningOutlined, ThunderboltOutlined, InfoCircleOutlined } from "@ant-design/icons";
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
  const [channelRec, setChannelRec] = useState<any>(null);
  const [ddlPreview, setDdlPreview] = useState<Record<string, { ddl: string; exists: boolean }>>({});
  const [s3Buckets, setS3Buckets] = useState<string[]>([]);
  const [rsWorkgroups, setRsWorkgroups] = useState<any[]>([]);
  const [rsDatabases, setRsDatabases] = useState<string[]>(["dev"]);
  const isEdit = !!editing;

  useEffect(() => {
    if (!open) return;
    fetch("/api/datasources").then((r) => r.json()).then((d) => setDataSources(d.success ? d.data : d));
    fetch("/api/s3/buckets").then((r) => r.json()).then((d) => setS3Buckets((d.success ? d.data : d).map((b: any) => b.name)));
    fetch("/api/redshift/connections").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRsWorkgroups(d); });
    fetch("/api/redshift/databases?workgroup=bgp-workgroup").then((r) => r.json()).then((d) => setRsDatabases(d.map((x: any) => x.name)));
  }, [open]);

  const onDatasourceChange = async (dsId: string) => {
    const ds = dataSources.find((d) => d.datasourceId === dsId);
    if (!ds) return;
    const res = await fetch(`/api/datasources/${dsId}/tables?database=${ds.database}`);
    const data = await res.json();
    const tableList = data.success ? data.data : data;
    setTables(tableList);
    const mappings: Record<string, any[]> = {};
    for (const t of tableList) {
      if (t.columns?.length) {
        const mapRes = await fetch("/api/sync/type-mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceDb: ds.type, columns: t.columns }) });
        const mapData = await mapRes.json();
        mappings[t.name] = (mapData.success ? mapData.data : mapData).map((m: any) => ({ ...m, include: true }));
      }
    }
    setFieldMappings(mappings);
  };

  const fetchChannelRec = async () => {
    const ds = dataSources.find((d) => d.datasourceId === form.getFieldValue("datasourceId"));
    const res = await fetch("/api/sync/recommend-channel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: ds?.type, targetType: form.getFieldValue("targetType"), syncMode: form.getFieldValue("syncMode") }) });
    const data = await res.json();
    setChannelRec(data.success ? data.data : data);
    if (data.data?.recommended) form.setFieldValue("channel", data.data.recommended);
  };

  const fetchDDL = async (tableName: string) => {
    const ds = dataSources.find((d) => d.datasourceId === form.getFieldValue("datasourceId"));
    const cols = fieldMappings[tableName]?.filter((f) => f.include);
    if (!cols?.length) return;
    const res = await fetch("/api/sync/generate-ddl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceDb: ds?.type, tableName, columns: cols.map((c: any) => ({ name: c.source, type: c.sourceType })), redshiftConfig: form.getFieldValue("redshiftConfig") }) });
    const data = await res.json();
    if (data.success) setDdlPreview((prev) => ({ ...prev, [tableName]: { ddl: data.data.ddl, exists: data.data.tableExists } }));
  };

  const executeDDL = async (tableName: string) => {
    const ddl = ddlPreview[tableName]?.ddl;
    if (!ddl) return;
    const res = await fetch("/api/sync/execute-ddl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ddl, workgroupName: form.getFieldValue(["redshiftConfig", "workgroupName"]), database: form.getFieldValue(["redshiftConfig", "database"]) }) });
    const data = await res.json();
    data.success ? message.success(`${tableName} 建表成功`) : message.error(data.error?.message || "建表失败");
  };

  const handleSubmit = async () => {
    const values = form.getFieldsValue(true);
    values.sourceTables = selectedTables;
    values.fieldMappings = {};
    selectedTables.forEach((t) => { values.fieldMappings[t] = fieldMappings[t]?.filter((f) => f.include) || []; });
    setSaving(true);
    try {
      const url = isEdit ? `/api/sync/${editing.taskId}` : "/api/sync";
      const res = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await res.json();
      data.success !== false ? onSuccess() : message.error(data.error?.message || "失败");
    } finally { setSaving(false); }
  };

  const validateStep = () => {
    const v = form.getFieldsValue(true);
    if (step === 0) {
      if (!v.name) { message.warning("请输入任务名称"); return false; }
      if (!v.datasourceId) { message.warning("请选择数据源"); return false; }
      if (!v.syncMode) { message.warning("请选择同步模式"); return false; }
      if (!v.writeMode) { message.warning("请选择写入模式"); return false; }
      if (!v.targetType) { message.warning("请选择目标类型"); return false; }
    }
    if (step === 1 && selectedTables.length === 0) { message.warning("请至少选择一张表"); return false; }
    return true;
  };

  const STEPS = [{ title: "源端配置" }, { title: "选表 & 映射" }, { title: "目标配置" }, { title: "建表预览" }, { title: "调度设置" }];
  const compatIcon = (c: string) => c === "compatible" ? <CheckCircleOutlined style={{ color: "#52c41a" }} /> : <WarningOutlined style={{ color: c === "truncation" ? "#ff4d4f" : "#faad14" }} />;

  return (
    <Modal title={isEdit ? "编辑同步任务" : "新建同步任务"} open={open} width={900} onCancel={onClose} onOk={handleSubmit} confirmLoading={saving}
      afterOpenChange={(o) => { if (o) { form.setFieldsValue(editing || {}); setStep(0); setTargetType(editing?.targetType || ""); setSelectedTables(editing?.sourceTables || []); setChannelRec(null); setDdlPreview({}); } else { form.resetFields(); setTables([]); setFieldMappings({}); setSelectedTables([]); } }}>
      <Steps current={step} size="small" style={{ marginBottom: 24 }} items={STEPS} />
      <Form form={form} layout="vertical" style={{ minHeight: 380 }} preserve>

        {/* ===== Step 0: 源端配置 ===== */}
        <div style={{ display: step === 0 ? undefined : "none" }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input placeholder="例如：订单表同步到S3" /></Form.Item>
          <Form.Item name="datasourceId" label="选择数据源" rules={[{ required: true }]}>
            <Select onChange={onDatasourceChange} options={dataSources.map((ds) => ({
              label: <Space>{ds.type === "mysql" ? "🐬" : "🐘"} {ds.name} <Tag>{ds.host?.split(".")[0]}/{ds.database}</Tag>{ds.status === "active" && <Tag color="green">已连接</Tag>}</Space>,
              value: ds.datasourceId,
            }))} />
          </Form.Item>
          <Space size={24}>
            <Form.Item name="syncMode" label="同步模式" rules={[{ required: true }]}>
              <Select style={{ width: 200 }} onChange={() => fetchChannelRec()} options={[{ label: "全量同步", value: "full" }, { label: "增量同步 (CDC)", value: "incremental" }]} />
            </Form.Item>
            <Form.Item name="writeMode" label="写入模式" rules={[{ required: true }]}>
              <Select style={{ width: 200 }} options={[{ label: "覆盖 (Overwrite)", value: "overwrite" }, { label: "追加 (Append)", value: "append" }, { label: "合并 (Merge)", value: "merge" }]} />
            </Form.Item>
          </Space>
          <Form.Item name="targetType" label="目标类型" rules={[{ required: true }]}>
            <Radio.Group onChange={(e) => { setTargetType(e.target.value); setTimeout(fetchChannelRec, 100); }}>
              <Radio.Button value="s3-tables">S3 数据湖</Radio.Button>
              <Radio.Button value="redshift">Redshift</Radio.Button>
              <Radio.Button value="both">S3 + Redshift</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {channelRec && (
            <div style={{ background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}><ThunderboltOutlined /> 通道推荐</div>
              <Form.Item name="channel" noStyle><Radio.Group>
                {channelRec.options?.map((o: any) => (
                  <Radio key={o.channel} value={o.channel} disabled={!o.supported} style={{ display: "block", marginBottom: 4 }}>
                    <Space>{o.channel === "glue" ? "Glue ETL" : o.channel === "zero-etl" ? "Zero-ETL" : "DMS CDC"} {o.recommended && <Tag color="green">推荐</Tag>} {!o.supported && <Tag color="red">不支持</Tag>} <span style={{ fontSize: 12, color: "#888" }}>{o.reason}</span></Space>
                  </Radio>
                ))}
              </Radio.Group></Form.Item>
            </div>
          )}
          <Form.Item name="whereClause" label="数据过滤条件 (WHERE)">
            <Input.TextArea rows={2} placeholder={"created_at >= '${run_date}' AND status = 'completed'"} />
          </Form.Item>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
            可用变量: <Tag>{"${run_date}"}</Tag> <Tag>{"${yesterday}"}</Tag>
            &nbsp; 快捷: <a onClick={() => form.setFieldValue("whereClause", "created_at >= '${run_date}'")}>当天</a> | <a onClick={() => form.setFieldValue("whereClause", "created_at >= CURRENT_DATE - INTERVAL 7 DAY")}>最近7天</a>
          </div>
          <Form.Item noStyle shouldUpdate>
            {() => form.getFieldValue("syncMode") === "incremental" ? (
              <div>
                <Divider>增量配置</Divider>
                <Form.Item name={["incrementalConfig", "strategy"]} label="增量策略" initialValue="timestamp">
                  <Radio.Group><Radio.Button value="timestamp">时间戳</Radio.Button><Radio.Button value="id">自增ID</Radio.Button><Radio.Button value="cdc">CDC</Radio.Button></Radio.Group>
                </Form.Item>
                <Space size={16}>
                  <Form.Item name={["incrementalConfig", "field"]} label="增量字段"><Input placeholder="updated_at" style={{ width: 200 }} /></Form.Item>
                  <Form.Item name={["incrementalConfig", "startValue"]} label="起始值"><Input placeholder="2026-01-01 00:00:00" style={{ width: 220 }} /></Form.Item>
                </Space>
              </div>
            ) : null}
          </Form.Item>
        </div>

        {/* ===== Step 1: 选表 & 映射 ===== */}
        <div style={{ display: step === 1 ? undefined : "none" }}>
          <Divider>选择同步表</Divider>
          {tables.length > 0 ? (
            <Checkbox.Group value={selectedTables} onChange={(v) => setSelectedTables(v as string[])}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {tables.map((t) => (
                  <div key={t.name} style={{ padding: "8px 12px", border: "1px solid #f0f0f0", borderRadius: 6, background: selectedTables.includes(t.name) ? "#e6f4ff" : "#fff" }}>
                    <Checkbox value={t.name}><Space><b>{t.name}</b><Tag>{t.columns?.length || 0} 字段</Tag></Space></Checkbox>
                  </div>
                ))}
              </Space>
            </Checkbox.Group>
          ) : <Alert type="info" message="请先在上一步选择数据源" />}
          {selectedTables.length > 0 && (
            <div>
              <Divider><SwapOutlined /> 字段映射</Divider>
              {selectedTables.map((tableName) => (
                <div key={tableName} style={{ marginBottom: 16 }}>
                  <h4>📋 {tableName}</h4>
                  <Table size="small" pagination={false} dataSource={fieldMappings[tableName]?.map((f, i) => ({ ...f, key: i }))} columns={[
                    { title: "同步", dataIndex: "include", width: 50, render: (_: any, r: any, i: number) => <Switch size="small" checked={r.include} onChange={(v) => { const m = { ...fieldMappings }; m[tableName] = [...m[tableName]]; m[tableName][i] = { ...m[tableName][i], include: v }; setFieldMappings(m); }} /> },
                    { title: "源字段", dataIndex: "source", render: (v: string) => <code>{v}</code> },
                    { title: "源类型", dataIndex: "sourceType", render: (v: string) => <Tag>{v}</Tag> },
                    { title: "", width: 30, render: () => "→" },
                    { title: "目标类型", dataIndex: "targetType", render: (v: string, r: any) => <Space>{compatIcon(r.compatibility)}<Tag color={r.compatibility === "compatible" ? "green" : "orange"}>{v}</Tag></Space> },
                    { title: "目标字段", dataIndex: "target", render: (_: any, r: any, i: number) => <Input size="small" value={r.target} onChange={(e) => { const m = { ...fieldMappings }; m[tableName] = [...m[tableName]]; m[tableName][i] = { ...m[tableName][i], target: e.target.value }; setFieldMappings(m); }} /> },
                  ]} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Step 2: 目标配置 ===== */}
        <div style={{ display: step === 2 ? undefined : "none" }}>
          {(targetType === "s3-tables" || targetType === "both") && (
            <div>
              <Divider>S3 Tables 数据湖配置</Divider>
              <Space size={16}>
                <Form.Item name={["s3Config", "tableBucket"]} label="Table Bucket" initialValue="bgp-table-bucket">
                  <Input style={{ width: 250 }} placeholder="bgp-table-bucket" />
                </Form.Item>
                <Form.Item name={["s3Config", "namespace"]} label="Namespace" initialValue="ecommerce">
                  <Input placeholder="ecommerce" style={{ width: 200 }} />
                </Form.Item>
              </Space>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                💡 S3 Tables 是 AWS 托管的 Iceberg 表服务，自动管理快照、压缩、合并。数据通过 Glue Catalog 的 s3tablescatalog 访问。
              </div>
              <Form.Item name={["s3Config", "format"]} label="文件格式" initialValue="parquet">
                <Select style={{ width: 200 }} options={[{ label: "Parquet (推荐)", value: "parquet" }, { label: "ORC", value: "orc" }, { label: "CSV", value: "csv" }]} />
              </Form.Item>
              <Form.List name={["s3Config", "partitionFields"]}>
                {(fields, { add, remove }) => (
                  <div>
                    <label style={{ fontWeight: 500 }}><InfoCircleOutlined /> 分区配置</label>
                    {fields.map(({ key, name }) => (
                      <Space key={key} align="baseline" style={{ display: "flex", marginBottom: 8 }}>
                        <Form.Item name={[name, "field"]} noStyle><Input placeholder="字段名" style={{ width: 180 }} /></Form.Item>
                        <Form.Item name={[name, "type"]} noStyle><Select style={{ width: 160 }} placeholder="分区类型" options={[{ label: "📅 日期", value: "date" }, { label: "🔤 字符串", value: "string" }]} /></Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加分区字段</Button>
                  </div>
                )}
              </Form.List>
              <Divider>Iceberg 表参数</Divider>
              <Form.Item name={["s3Config", "format"]} label="存储格式" initialValue="iceberg">
                <Select style={{ width: 200 }} disabled options={[{ label: "Iceberg (S3 Tables 托管)", value: "iceberg" }]} />
              </Form.Item>
              <Space size={16}>
                <Form.Item name={["s3Config", "icebergConfig", "snapshotRetentionDays"]} label="快照保留天数" initialValue={7}>
                  <InputNumber min={1} max={365} style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name={["s3Config", "icebergConfig", "maxSnapshots"]} label="最大快照数" initialValue={100}>
                  <InputNumber min={1} max={1000} style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name={["s3Config", "icebergConfig", "compactionMinutes"]} label="自动合并间隔(分钟)" initialValue={60}>
                  <InputNumber min={5} max={1440} style={{ width: 140 }} />
                </Form.Item>
              </Space>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                💡 Iceberg 表支持 ACID 事务、Schema 演进、时间旅行查询。数据自动注册到 Glue Data Catalog，可通过 Athena/Redshift Spectrum 直接查询。
              </div>
            </div>
          )}
          {(targetType === "redshift" || targetType === "both") && (
            <div>
              <Divider>Redshift 配置</Divider>
              <Space size={16}>
                <Form.Item name={["redshiftConfig", "workgroupName"]} label="Workgroup" initialValue="bgp-workgroup">
                  <Select style={{ width: 200 }} onChange={(v) => { fetch(`/api/redshift/databases?workgroup=${v}`).then((r) => r.json()).then((d) => setRsDatabases(Array.isArray(d) ? d.map((x: any) => x.name || x) : ["dev"])); }} options={rsWorkgroups.length > 0 ? rsWorkgroups.map((w) => ({ label: w.workgroupName, value: w.workgroupName })) : [{ label: "bgp-workgroup", value: "bgp-workgroup" }]} />
                </Form.Item>
                <Form.Item name={["redshiftConfig", "database"]} label="Database" initialValue="dev"><Select style={{ width: 150 }} options={rsDatabases.map((d) => ({ label: d, value: d }))} /></Form.Item>
                <Form.Item name={["redshiftConfig", "schema"]} label="Schema" initialValue="public"><Input style={{ width: 120 }} /></Form.Item>
              </Space>
              <Space size={16}>
                <Form.Item name={["redshiftConfig", "distStyle"]} label="分布策略" initialValue="auto"><Select style={{ width: 150 }} options={[{ label: "AUTO", value: "auto" }, { label: "KEY", value: "key" }, { label: "EVEN", value: "even" }]} /></Form.Item>
                <Form.Item name={["redshiftConfig", "distKey"]} label="DISTKEY"><Input placeholder="主键" style={{ width: 150 }} /></Form.Item>
                <Form.Item name={["redshiftConfig", "sortKeys"]} label="SORTKEY"><Input placeholder="col1,col2" style={{ width: 200 }} /></Form.Item>
              </Space>
            </div>
          )}
        </div>

        {/* ===== Step 3: 建表预览 ===== */}
        <div style={{ display: step === 3 ? undefined : "none" }}>
          {(targetType === "redshift" || targetType === "both") ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ color: "#666" }}>预览建表 DDL</span>
                <Button size="small" onClick={() => selectedTables.forEach(fetchDDL)}>生成 DDL</Button>
              </div>
              {selectedTables.map((tableName) => (
                <div key={tableName} style={{ marginBottom: 16, border: "1px solid #f0f0f0", borderRadius: 8, padding: 12 }}>
                  <Space style={{ marginBottom: 8 }}><b>{tableName}</b>{ddlPreview[tableName]?.exists ? <Tag color="orange">表已存在</Tag> : <Tag color="blue">新建</Tag>}</Space>
                  <pre style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: "auto" }}>{ddlPreview[tableName]?.ddl || "点击\"生成 DDL\"按钮"}</pre>
                  <Space style={{ marginTop: 8 }}>
                    <Button size="small" type="primary" onClick={() => executeDDL(tableName)}>执行建表</Button>
                    <Button size="small" onClick={() => fetchDDL(tableName)}>刷新</Button>
                  </Space>
                </div>
              ))}
            </div>
          ) : <Alert type="info" message="S3 目标无需建表，Parquet 文件自动创建" />}
        </div>

        {/* ===== Step 4: 调度设置 ===== */}
        <div style={{ display: step === 4 ? undefined : "none" }}>
          <Form.Item name="scheduleEnabled" label="启用调度" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() => form.getFieldValue("scheduleEnabled") ? (
              <div>
                <Form.Item name="cronExpression" label="Cron 表达式">
                  <Input placeholder="0 2 * * *" addonAfter={<Select style={{ width: 130 }} placeholder="快捷" onChange={(v) => form.setFieldValue("cronExpression", v)} options={[{ label: "每小时", value: "0 * * * *" }, { label: "每天2点", value: "0 2 * * *" }, { label: "每6小时", value: "0 */6 * * *" }]} />} />
                </Form.Item>
                <Space size={24}>
                  <Form.Item name="retryCount" label="失败重试" initialValue={2}><InputNumber min={0} max={5} /></Form.Item>
                  <Form.Item name="timeout" label="超时(秒)" initialValue={3600}><InputNumber min={60} max={86400} /></Form.Item>
                </Space>
              </div>
            ) : null}
          </Form.Item>
        </div>
      </Form>

      <div style={{ textAlign: "right", marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
        {step > 0 && <Button onClick={() => setStep(step - 1)} style={{ marginRight: 8 }}>上一步</Button>}
        {step < STEPS.length - 1 && <Button type="primary" onClick={() => { if (validateStep()) setStep(step + 1); }}>下一步</Button>}
      </div>
    </Modal>
  );
}
