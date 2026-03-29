import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { CodeOutlined } from "@ant-design/icons";

function PythonNode({ data }: NodeProps) {
  return (
    <div style={{ padding: "8px 16px", border: "2px solid #faad14", borderRadius: 8, background: "#fffbe6", minWidth: 120 }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <CodeOutlined style={{ color: "#faad14" }} />
        <span>{data.label || "Python 脚本"}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(PythonNode);
