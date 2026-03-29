"use client";

import React, { useCallback, useMemo } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import SyncNode from "./SyncNode";
import SqlNode from "./SqlNode";
import PythonNode from "./PythonNode";

interface Props {
  nodes: Node[];
  edges: Edge[];
  onChange: (nodes: Node[], edges: Edge[]) => void;
}

export default function DagEditor({ nodes: initNodes, edges: initEdges, onChange }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const nodeTypes = useMemo(() => ({ sync: SyncNode, sql: SqlNode, python: PythonNode }), []);

  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, animated: true }, eds)),
    [setEdges]
  );

  // Notify parent on changes
  const handleNodesChange: typeof onNodesChange = (changes) => {
    onNodesChange(changes);
    setTimeout(() => onChange(nodes, edges), 0);
  };

  const handleEdgesChange: typeof onEdgesChange = (changes) => {
    onEdgesChange(changes);
    setTimeout(() => onChange(nodes, edges), 0);
  };

  return (
    <div style={{ height: "60vh", border: "1px solid #d9d9d9", borderRadius: 8 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
