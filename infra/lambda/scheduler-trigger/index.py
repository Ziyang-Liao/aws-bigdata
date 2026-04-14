import json
import boto3
import os

region = os.environ.get("AWS_REGION", "us-east-1")
mwaa_env = os.environ.get("MWAA_ENV_NAME", "bgp-mwaa")

def handler(event, context):
    task_id = event.get("taskId", "")
    task_type = event.get("taskType", "sync")

    if task_type == "workflow":
        # Trigger MWAA DAG
        dynamodb = boto3.resource("dynamodb", region_name=region)
        wf = dynamodb.Table("bgp-workflows").get_item(
            Key={"userId": "default-user", "workflowId": task_id}
        ).get("Item")
        if not wf or not wf.get("airflowDagId"):
            return {"error": f"Workflow {task_id} not found or not published"}

        dag_id = wf["airflowDagId"]
        mwaa = boto3.client("mwaa", region_name=region)
        token_resp = mwaa.create_cli_token(Name=mwaa_env)
        import urllib.request
        req = urllib.request.Request(
            f"https://{token_resp['WebServerHostname']}/aws_mwaa/cli",
            data=f"dags trigger {dag_id}".encode(),
            headers={"Authorization": f"Bearer {token_resp['CliToken']}", "Content-Type": "text/plain"},
        )
        resp = urllib.request.urlopen(req, timeout=30)
        print(f"Triggered DAG {dag_id}: {resp.status}")
        return {"dagId": dag_id, "status": "triggered"}

    elif task_type == "sync":
        # Trigger Glue sync job
        dynamodb = boto3.resource("dynamodb", region_name=region)
        task = dynamodb.Table("bgp-sync-tasks").get_item(
            Key={"userId": "default-user", "taskId": task_id}
        ).get("Item")
        if not task or not task.get("glueJobName"):
            return {"error": f"Sync task {task_id} not found or no Glue job"}

        glue = boto3.client("glue", region_name=region)
        run = glue.start_job_run(JobName=task["glueJobName"])
        print(f"Started Glue job {task['glueJobName']}: {run['JobRunId']}")
        return {"jobName": task["glueJobName"], "runId": run["JobRunId"]}

    return {"error": f"Unknown task type: {task_type}"}
