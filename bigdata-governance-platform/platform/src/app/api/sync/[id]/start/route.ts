import { ddb, Tables } from "@/lib/aws/dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { glue } from "@/lib/aws/glue";
import { StartJobRunCommand, CreateJobCommand, GetJobCommand } from "@aws-sdk/client-glue";
import { NextRequest, NextResponse } from "next/server";
import { generateGlueScript } from "@/lib/sync/glue-script-generator";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/sync/:id/start
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { Item: task } = await ddb.send(
    new GetCommand({ TableName: Tables.SYNC_TASKS, Key: { userId: "default", taskId: id } })
  );
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jobName = `bgp-sync-${id}`;

  // 确保 Glue Job 存在
  try {
    await glue.send(new GetJobCommand({ JobName: jobName }));
  } catch {
    const script = generateGlueScript(task);
    await glue.send(new CreateJobCommand({
      Name: jobName,
      Role: process.env.GLUE_ROLE_ARN || "arn:aws:iam::role/bgp-glue-role",
      Command: { Name: "glueetl", ScriptLocation: `s3://${process.env.GLUE_SCRIPTS_BUCKET || "bgp-glue-scripts"}/${jobName}.py`, PythonVersion: "3" },
      GlueVersion: "4.0",
      NumberOfWorkers: 2,
      WorkerType: "G.1X",
      DefaultArguments: { "--job-language": "python", "--script-content": script },
    }));
  }

  // 启动 Job Run
  const { JobRunId } = await glue.send(new StartJobRunCommand({ JobName: jobName }));

  await ddb.send(new UpdateCommand({
    TableName: Tables.SYNC_TASKS,
    Key: { userId: "default", taskId: id },
    UpdateExpression: "SET #s = :s, glueJobName = :jn, updatedAt = :ua",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": "running", ":jn": jobName, ":ua": new Date().toISOString() },
  }));

  return NextResponse.json({ success: true, jobRunId: JobRunId });
}
