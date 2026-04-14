"use client";

import React, { useEffect, useState } from "react";
import { Spin, Alert, Button, Space } from "antd";
import { LinkOutlined, ReloadOutlined } from "@ant-design/icons";

export default function OpenMetadataPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/openmetadata/url")
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setUrl(d.url);
        else setError(d.error || "OpenMetadata 服务未就绪");
      })
      .catch(() => setError("无法连接 OpenMetadata 服务"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (error) return <Alert type="warning" message="OpenMetadata 服务" description={error} showIcon style={{ margin: 40 }} />;

  return (
    <div style={{ height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
        <h2 style={{ margin: 0 }}>数据治理中心</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { const iframe = document.getElementById("om-iframe") as HTMLIFrameElement; if (iframe) iframe.src = iframe.src; }}>刷新</Button>
          <Button icon={<LinkOutlined />} onClick={() => window.open(url, "_blank")}>新窗口打开</Button>
        </Space>
      </div>
      <iframe id="om-iframe" src={url} style={{ flex: 1, border: "1px solid #f0f0f0", borderRadius: 8 }} />
    </div>
  );
}
