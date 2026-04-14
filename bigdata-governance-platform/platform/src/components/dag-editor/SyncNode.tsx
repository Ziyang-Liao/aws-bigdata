import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";

const statusStyle: Record<string, { border: string; bg: string; icon: any }> = {
  waiting: { border: "#d9d9d9", bg: "#fafafa", icon: <ClockCircleOutlined style={{ color: "#d9d9d9" }} /> },
  running: { border: "#1677ff", bg: "#e6f4ff", icon: <SyncOutlined spin style={{ color: "#1677ff" }} /> },
  succeeded: { border: "#52c41a", bg: "#f6ffed", icon: <CheckCircleOutlined style={{ color: "#52c41a" }} /> },
  failed: { border: "#ff4d4f", bg: "#fff2f0", icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} /> },
  skipped: { border: "#faad14", bg: "#fffbe6", icon: <ClockCircleOutlined style={{ color: "#faad14" }} /> },
};

function SyncNode({ data }: NodeProps) {
  const st = statusStyle[data.runStatus] || statusStyle.waiting;
  return (
    <div style={{ padding: "8px 16px", border: `2px solid ${data.runStatus ? st.border : "#1677ff"}`, borderRadius: 8, background: data.runStatus ? st.bg : "#e6f4ff", minWidth: 120 }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {data.runStatus ? st.icon : <SyncOutlined style={{ color: "#1677ff" }} />}
        <span>{data.label || "数据同步"}</span>
      </div>
      {data.duration && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{data.duration}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(SyncNode);
