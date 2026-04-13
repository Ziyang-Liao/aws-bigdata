export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { RedshiftDataClient, DescribeStatementCommand, GetStatementResultCommand } from "@aws-sdk/client-redshift-data";

const client = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const desc = await client.send(new DescribeStatementCommand({ Id: params.id }));

  if (desc.Status === "FINISHED") {
    const result = await client.send(new GetStatementResultCommand({ Id: params.id }));
    return NextResponse.json({
      status: "FINISHED",
      columns: result.ColumnMetadata?.map((c) => c.name) || [],
      rows: result.Records?.map((row) => row.map((cell) => Object.values(cell)[0])) || [],
      totalRows: result.TotalNumRows,
    });
  }

  return NextResponse.json({ status: desc.Status, error: desc.Error });
}
