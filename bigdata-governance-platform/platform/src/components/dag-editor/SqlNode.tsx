import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { ConsoleSqlOutlined } from "@ant-design/icons";

function SqlNode({ data }: NodeProps) {
  return (
    <div style={{ padding: "8px 16px", border: "2px solid #52c41a", borderRadius: 8, background: "#f6ffed", minWidth: 120 }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ConsoleSqlOutlined style={{ color: "#52c41a" }} />
        <span>{data.label || "SQL 节点"}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(SqlNode);
