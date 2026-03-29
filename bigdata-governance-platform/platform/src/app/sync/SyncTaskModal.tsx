"use client";

import React, { useEffect, useState } from "react";
import { Modal, Form, Input, Select, Steps } from "antd";
import type { SyncTask } from "@/types/sync-task";
import type { DataSource } from "@/types/datasource";

interface Props {
  open: boolean;
  editing?: SyncTask;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SyncTaskModal({ open, editing, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open) fetch("/api/datasources").then((r) => r.json()).then(setDataSources);
  }, [open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const url = isEdit ? `/api/sync/${editing.taskId}` : "/api/sync";
      const method = isEdit ? "PUT" : "POST";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? "编辑同步任务" : "新建同步任务"}
      open={open}
      width={640}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={saving}
      afterOpenChange={(o) => { if (o) { form.setFieldsValue(editing || {}); setStep(0); } else form.resetFields(); }}
    >
      <Steps current={step} size="small" style={{ marginBottom: 24 }}
        items={[{ title: "基本信息" }, { title: "源端配置" }, { title: "目标配置" }]}
      />
      <Form form={form} layout="vertical">
        {step === 0 && (
          <>
            <Form.Item name="name" label="任务名称" rules={[{ required: true }]}>
              <Input placeholder="例如：用户表全量同步" />
            </Form.Item>
            <Form.Item name="channel" label="同步通道" rules={[{ required: true }]}>
              <Select options={[
                { label: "Zero-ETL（推荐，近实时）", value: "zero-etl" },
                { label: "Glue ETL（通用）", value: "glue" },
                { label: "DMS CDC（增量）", value: "dms" },
              ]} />
            </Form.Item>
            <Form.Item name="syncMode" label="同步模式" rules={[{ required: true }]}>
              <Select options={[{ label: "全量", value: "full" }, { label: "增量 (CDC)", value: "incremental" }]} />
            </Form.Item>
          </>
        )}
        {step === 1 && (
          <>
            <Form.Item name="datasourceId" label="数据源" rules={[{ required: true }]}>
              <Select options={dataSources.map((ds) => ({ label: `${ds.name} (${ds.type})`, value: ds.datasourceId }))} />
            </Form.Item>
            <Form.Item name="sourceDatabase" label="源数据库">
              <Input />
            </Form.Item>
            <Form.Item name="sourceTables" label="源表（逗号分隔）">
              <Input placeholder="table1,table2" />
            </Form.Item>
          </>
        )}
        {step === 2 && (
          <>
            <Form.Item name="targetType" label="目标类型" rules={[{ required: true }]}>
              <Select options={[
                { label: "S3 Tables (Iceberg)", value: "s3-tables" },
                { label: "Redshift", value: "redshift" },
                { label: "S3 + Redshift", value: "both" },
              ]} />
            </Form.Item>
            <Form.Item name="writeMode" label="写入模式" rules={[{ required: true }]}>
              <Select options={[
                { label: "追加 (Append)", value: "append" },
                { label: "覆盖 (Overwrite)", value: "overwrite" },
                { label: "合并 (Merge/Upsert)", value: "merge" },
              ]} />
            </Form.Item>
          </>
        )}
      </Form>
      <div style={{ textAlign: "right", marginTop: 8 }}>
        {step > 0 && <a onClick={() => setStep(step - 1)} style={{ marginRight: 16 }}>上一步</a>}
        {step < 2 && <a onClick={() => setStep(step + 1)}>下一步</a>}
      </div>
    </Modal>
  );
}
