"use client";

import React, { useState, useEffect } from "react";
import { Modal, Form, Input, InputNumber, Select, Button, Steps, Space, Tag, Alert, Spin, Radio, message, Result } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, CloudServerOutlined } from "@ant-design/icons";
import { DS_TYPE_OPTIONS, type DataSource } from "@/types/datasource";

interface Props { open: boolean; editing?: DataSource; onClose: () => void; onSuccess: () => void; }

export default function DataSourceModal({ open, editing, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [rdsInstances, setRdsInstances] = useState<any[]>([]);
  const [loadingRds, setLoadingRds] = useState(false);
  const [connectMode, setConnectMode] = useState<"manual" | "rds">("manual");
  const [provisionResult, setProvisionResult] = useState<any>(null);
  const isEdit = !!editing;

  const loadRdsInstances = async () => {
    setLoadingRds(true);
    try {
      const res = await fetch("/api/datasources/discover");
      const data = await res.json();
      setRdsInstances(data.success ? data.data : []);
    } catch {} finally { setLoadingRds(false); }
  };

  const handleTest = async () => {
    try {
      const values = form.getFieldsValue(true); // Get ALL fields including hidden steps
      setTesting(true);
      setTestResult(null);
      const res = await fetch("/api/datasources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      setTestResult(data.success ? data.data : data.data || { success: false, steps: [{ name: "error", status: "fail", message: data.error?.message }] });
    } catch (e: any) {
      setTestResult({ success: false, steps: [{ name: "error", status: "fail", message: e.message }] });
    } finally { setTesting(false); }
  };

  const handleSubmit = async () => {
    const values = form.getFieldsValue(true); // Get ALL fields including hidden steps
    setSaving(true);
    try {
      const url = isEdit ? `/api/datasources/${editing.datasourceId}` : "/api/datasources";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await res.json();
      if (data.success !== false && res.ok) {
        setProvisionResult(data.data || data);
        if (isEdit) { message.success("已更新"); onSuccess(); }
        else setStep(2);
      } else {
        message.error(data.error?.message || "创建失败，请检查配置");
      }
    } catch (e: any) {
      message.error(e.message);
    } finally { setSaving(false); }
  };

  const handleRdsSelect = (instance: any) => {
    const engineMap: Record<string, string> = { mysql: "mysql", postgres: "postgresql", oracle: "oracle" };
    form.setFieldsValue({
      host: instance.endpoint,
      port: instance.port,
      type: engineMap[instance.engine] || instance.engine,
    });
  };

  return (
    <Modal title={isEdit ? "编辑数据源" : "新建数据源"} open={open} width={680} onCancel={onClose}
      afterOpenChange={(o) => { if (o) { form.setFieldsValue(editing || {}); setStep(0); setTestResult(null); setProvisionResult(null); } else form.resetFields(); }}
      footer={step === 2 ? [<Button key="done" type="primary" onClick={onSuccess}>完成</Button>] : [
        step > 0 && step < 2 && <Button key="back" onClick={() => setStep(step - 1)}>上一步</Button>,
        step === 0 && <Button key="next" type="primary" onClick={() => setStep(1)}>下一步</Button>,
        step === 1 && <Button key="test" onClick={handleTest} loading={testing}>测试连接</Button>,
        step === 1 && <Button key="save" type="primary" onClick={handleSubmit} loading={saving}>{isEdit ? "保存" : "创建数据源"}</Button>,
      ].filter(Boolean)}>

      <Steps current={step} size="small" style={{ marginBottom: 24 }}
        items={[{ title: "基本信息" }, { title: "连接配置" }, { title: isEdit ? "完成" : "资源创建" }]} />

      <Form form={form} layout="vertical" style={{ minHeight: 300 }} preserve>
        <div style={{ display: step === 0 ? undefined : "none" }}>
          <Form.Item name="name" label="数据源名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="例如：电商业务库" />
          </Form.Item>
          <Form.Item name="type" label="数据库类型" rules={[{ required: true }]}>
            <Select onChange={(v) => {
              const opt = DS_TYPE_OPTIONS.find((o) => o.value === v);
              if (opt) form.setFieldValue("port", opt.defaultPort);
            }}>
              {DS_TYPE_OPTIONS.map((o) => (
                <Select.Option key={o.value} value={o.value}>
                  <Space>{o.icon} {o.label}</Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="env" label="环境">
            <Radio.Group>
              <Radio.Button value="dev">开发</Radio.Button>
              <Radio.Button value="staging">预发</Radio.Button>
              <Radio.Button value="prod">生产</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </div>

        <div style={{ display: step === 1 ? undefined : "none" }}>
          <div style={{ marginBottom: 16 }}>
            <Radio.Group value={connectMode} onChange={(e) => { setConnectMode(e.target.value); if (e.target.value === "rds") loadRdsInstances(); }}>
              <Radio.Button value="manual">手动输入</Radio.Button>
              <Radio.Button value="rds"><CloudServerOutlined /> 从 RDS 选择</Radio.Button>
            </Radio.Group>
          </div>

          {connectMode === "rds" && (
            <div style={{ marginBottom: 16, maxHeight: 160, overflow: "auto", border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
              {loadingRds ? <Spin /> : rdsInstances.length > 0 ? rdsInstances.map((inst) => (
                <div key={inst.identifier} onClick={() => handleRdsSelect(inst)}
                  style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 6, marginBottom: 4, border: "1px solid #f0f0f0", background: form.getFieldValue("host") === inst.endpoint ? "#e6f4ff" : "#fff" }}>
                  <Space>
                    <b>{inst.identifier}</b>
                    <Tag>{inst.engine} {inst.engineVersion}</Tag>
                    <Tag color={inst.isPublic ? "red" : "green"}>{inst.isPublic ? "公网" : "私有"}</Tag>
                  </Space>
                  <div style={{ fontSize: 12, color: "#888" }}>{inst.endpoint}:{inst.port}</div>
                </div>
              )) : <div style={{ color: "#999", textAlign: "center", padding: 20 }}>未发现 RDS 实例</div>}
            </div>
          )}

          <Space size={12} style={{ width: "100%" }} direction="vertical">
            <Space size={12}>
              <Form.Item name="host" label="主机地址" rules={[{ required: true }]} style={{ marginBottom: 0, width: 360 }}>
                <Input placeholder="xxx.rds.amazonaws.com" />
              </Form.Item>
              <Form.Item name="port" label="端口" rules={[{ required: true }]} style={{ marginBottom: 0, width: 100 }}>
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Space>
            <Form.Item name="database" label="数据库名" rules={[{ required: true }]}>
              <Input placeholder="ecommerce" />
            </Form.Item>
            <Space size={12}>
              <Form.Item name="username" label="用户名" rules={[{ required: true }]} style={{ marginBottom: 0, width: 240 }}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: !isEdit }]} style={{ marginBottom: 0, width: 240 }}>
                <Input.Password placeholder={isEdit ? "不修改请留空" : ""} />
              </Form.Item>
            </Space>
          </Space>

          {testResult && (
            <Alert type={testResult.success ? "success" : "error"} style={{ marginTop: 16 }}
              message={testResult.success ? "连接测试通过" : "连接测试失败"}
              description={
                <div style={{ fontSize: 12 }}>
                  {testResult.steps?.map((s: any, i: number) => (
                    <div key={i}>
                      {s.status === "pass" ? <CheckCircleOutlined style={{ color: "#52c41a" }} /> : <CloseCircleOutlined style={{ color: "#ff4d4f" }} />}
                      {" "}{s.name}: {s.message} {s.latencyMs ? `(${s.latencyMs}ms)` : ""}
                    </div>
                  ))}
                  {testResult.totalMs > 0 && <div style={{ marginTop: 4 }}>总耗时: {testResult.totalMs}ms</div>}
                </div>
              }
            />
          )}
        </div>

        {step === 2 && (
          <Result status="success" title="数据源创建成功" subTitle="以下 AWS 资源已自动创建"
            extra={provisionResult?.provisionedResources && (
              <div style={{ textAlign: "left", background: "#f6ffed", padding: 16, borderRadius: 8 }}>
                <div>✅ 密码存储: <Tag color="blue">Secrets Manager</Tag></div>
                <div>✅ 网络配置: <Tag>VPC {provisionResult.provisionedResources.vpcId?.slice(-8)}</Tag> <Tag>SG {provisionResult.provisionedResources.securityGroupId?.slice(-8)}</Tag></div>
                <div>✅ Glue 连接: <Tag color="green">{provisionResult.provisionedResources.glueConnectionName}</Tag></div>
                <div>✅ 连接测试: <Tag color="processing"><LoadingOutlined /> 后台测试中...</Tag></div>
              </div>
            )}
          />
        )}
      </Form>
    </Modal>
  );
}
