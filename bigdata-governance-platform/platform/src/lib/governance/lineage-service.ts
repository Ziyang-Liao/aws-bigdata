import { PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const LINEAGE_TABLE = "bgp-lineage";

export interface LineageEdge {
  targetFqn: string;
  sourceFqn: string;
  lineageType: "sync" | "sql" | "manual";
  taskId?: string;
  columnMappings?: { source: string; target: string }[];
  createdAt: string;
}

// Generate lineage from sync task config
export async function generateSyncLineage(task: any, datasource: any) {
  const edges: LineageEdge[] = [];
  const now = new Date().toISOString();
  const sourcePrefix = `${datasource.type}.${datasource.database}`;

  for (const table of task.sourceTables || []) {
    // Source → S3
    if (task.targetType === "s3-tables" || task.targetType === "both") {
      const s3Fqn = `s3.${task.s3Config?.bucket || "datalake"}.${task.s3Config?.prefix || ""}${table}`;
      edges.push({
        targetFqn: s3Fqn, sourceFqn: `${sourcePrefix}.${table}`,
        lineageType: "sync", taskId: task.taskId,
        columnMappings: task.fieldMappings?.[table]?.filter((f: any) => f.include).map((f: any) => ({ source: f.source, target: f.target })),
        createdAt: now,
      });
    }

    // Source → Redshift (or S3 → Redshift)
    if (task.targetType === "redshift" || task.targetType === "both") {
      const schema = task.redshiftConfig?.schema || "public";
      const rsFqn = `redshift.${task.redshiftConfig?.database || "dev"}.${schema}.${table}`;
      const source = task.targetType === "both"
        ? `s3.${task.s3Config?.bucket || "datalake"}.${task.s3Config?.prefix || ""}${table}`
        : `${sourcePrefix}.${table}`;
      edges.push({
        targetFqn: rsFqn, sourceFqn: source,
        lineageType: "sync", taskId: task.taskId,
        columnMappings: task.fieldMappings?.[table]?.filter((f: any) => f.include).map((f: any) => ({ source: f.source, target: f.target })),
        createdAt: now,
      });

      // Also direct source → redshift if both
      if (task.targetType === "both") {
        edges.push({
          targetFqn: rsFqn, sourceFqn: `${sourcePrefix}.${table}`,
          lineageType: "sync", taskId: task.taskId, createdAt: now,
        });
      }
    }
  }

  // Save to DynamoDB
  for (const edge of edges) {
    try {
      await docClient.send(new PutCommand({ TableName: LINEAGE_TABLE, Item: edge }));
    } catch {}
  }

  return edges;
}

// Get lineage for a table (upstream + downstream)
export async function getLineage(fqn: string, depth = 2) {
  const nodes: Map<string, { fqn: string; type: string }> = new Map();
  const edges: { source: string; target: string; lineageType: string; columnMappings?: any[] }[] = [];

  const visited = new Set<string>();

  async function traceUpstream(targetFqn: string, d: number) {
    if (d <= 0 || visited.has(`up:${targetFqn}`)) return;
    visited.add(`up:${targetFqn}`);

    try {
      const { Items = [] } = await docClient.send(new QueryCommand({
        TableName: LINEAGE_TABLE,
        KeyConditionExpression: "targetFqn = :t",
        ExpressionAttributeValues: { ":t": targetFqn },
      }));

      for (const item of Items) {
        const srcFqn = item.sourceFqn as string;
        nodes.set(targetFqn, { fqn: targetFqn, type: targetFqn.split(".")[0] });
        nodes.set(srcFqn, { fqn: srcFqn, type: srcFqn.split(".")[0] });
        edges.push({ source: srcFqn, target: targetFqn, lineageType: item.lineageType, columnMappings: item.columnMappings });
        await traceUpstream(srcFqn, d - 1);
      }
    } catch {}
  }

  async function traceDownstream(sourceFqn: string, d: number) {
    if (d <= 0 || visited.has(`down:${sourceFqn}`)) return;
    visited.add(`down:${sourceFqn}`);

    try {
      // Scan for downstream (sourceFqn is not PK, need scan or GSI)
      const { Items = [] } = await docClient.send(new ScanCommand({
        TableName: LINEAGE_TABLE,
        FilterExpression: "sourceFqn = :s",
        ExpressionAttributeValues: { ":s": sourceFqn },
      }));

      for (const item of Items) {
        const tgtFqn = item.targetFqn as string;
        nodes.set(sourceFqn, { fqn: sourceFqn, type: sourceFqn.split(".")[0] });
        nodes.set(tgtFqn, { fqn: tgtFqn, type: tgtFqn.split(".")[0] });
        edges.push({ source: sourceFqn, target: tgtFqn, lineageType: item.lineageType, columnMappings: item.columnMappings });
        await traceDownstream(tgtFqn, d - 1);
      }
    } catch {}
  }

  await traceUpstream(fqn, depth);
  await traceDownstream(fqn, depth);
  nodes.set(fqn, { fqn, type: fqn.split(".")[0] });

  return {
    nodes: Array.from(nodes.values()),
    edges,
    centerNode: fqn,
  };
}
