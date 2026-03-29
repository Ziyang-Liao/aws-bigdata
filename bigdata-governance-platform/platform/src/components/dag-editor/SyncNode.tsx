import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { SyncOutlined } from "@ant-design/icons";

function SyncNode({ data }: NodeProps) {
  return (
    <div style={{ padding: "8px 16px", border: "2px solid #1677ff", borderRadius: 8, background: "#e6f4ff", minWidth: 120 }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <SyncOutlined style={{ color: "#1677ff" }} />
        <span>{data.label || "数据同步"}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(SyncNode);
