"use client";

import React, { useCallback, useMemo, useState } from "react";
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
import NodeConfigPanel from "./NodeConfigPanel";

interface Props {
  nodes: Node[];
  edges: Edge[];
  onChange: (nodes: Node[], edges: Edge[]) => void;
}

export default function DagEditor({ nodes: initNodes, edges: initEdges, onChange }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Sync when parent adds nodes
  React.useEffect(() => { setNodes(initNodes); }, [initNodes.length]);

  const nodeTypes = useMemo(() => ({ sync: SyncNode, sql: SqlNode, python: PythonNode }), []);

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...conn, animated: true }, eds);
        setTimeout(() => onChange(nodes, next), 0);
        return next;
      });
    },
    [setEdges, nodes, onChange]
  );

  const handleNodeClick = useCallback((_: any, node: Node) => setSelectedNode(node), []);

  const handleNodeDataChange = useCallback(
    (id: string, data: any) => {
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === id ? { ...n, data } : n));
        setTimeout(() => onChange(next, edges), 0);
        return next;
      });
    },
    [setNodes, edges, onChange]
  );

  return (
    <>
      <div style={{ height: "60vh", border: "1px solid #d9d9d9", borderRadius: 8 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => { onNodesChange(changes); setTimeout(() => onChange(nodes, edges), 0); }}
          onEdgesChange={(changes) => { onEdgesChange(changes); setTimeout(() => onChange(nodes, edges), 0); }}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      <NodeConfigPanel node={selectedNode} onClose={() => setSelectedNode(null)} onChange={handleNodeDataChange} />
    </>
  );
}
