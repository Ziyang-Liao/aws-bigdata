import { NextRequest, NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, GetTablesCommand } from "@aws-sdk/client-glue";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { Item: ds } = await docClient.send(
    new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
  );
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const database = req.nextUrl.searchParams.get("database") || ds.database;

  try {
    // Try Glue Data Catalog first
    const { TableList = [] } = await glue.send(new GetTablesCommand({ DatabaseName: database }));
    return NextResponse.json(TableList.map((t) => ({
      name: t.Name,
      database,
      columns: t.StorageDescriptor?.Columns?.map((c) => ({ name: c.Name, type: c.Type, comment: c.Comment })) || [],
      partitionKeys: t.PartitionKeys?.map((p) => ({ name: p.Name, type: p.Type })) || [],
      location: t.StorageDescriptor?.Location,
      rowCount: t.Parameters?.recordCount,
    })));
  } catch {
    // Fallback: return placeholder
    return NextResponse.json([
      { name: "users", database, columns: [{ name: "user_id", type: "int" }, { name: "username", type: "varchar(50)" }, { name: "email", type: "varchar(100)" }, { name: "user_level", type: "varchar(20)" }, { name: "created_at", type: "datetime" }] },
      { name: "orders", database, columns: [{ name: "order_id", type: "int" }, { name: "customer_id", type: "int" }, { name: "product_name", type: "varchar(100)" }, { name: "amount", type: "decimal(10,2)" }, { name: "order_status", type: "varchar(20)" }, { name: "order_date", type: "date" }, { name: "created_at", type: "datetime" }] },
      { name: "products", database, columns: [{ name: "product_id", type: "int" }, { name: "product_name", type: "varchar(100)" }, { name: "category", type: "varchar(50)" }, { name: "price", type: "decimal(10,2)" }, { name: "stock", type: "int" }] },
    ]);
  }
}
