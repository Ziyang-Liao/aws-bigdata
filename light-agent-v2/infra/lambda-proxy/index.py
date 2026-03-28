"""
Lambda Proxy — CloudFront → Lambda → AgentCore Runtime
前端页面 + API 代理
"""

import json
import os
import base64
import time
import boto3

RUNTIME_ARN = os.environ["AGENTCORE_RUNTIME_ARN"]
REGION = os.environ.get("AWS_REGION", "us-east-1")

client = boto3.client("bedrock-agentcore", region_name=REGION)

# 启动时加载前端 HTML
with open(os.path.join(os.path.dirname(__file__), "frontend.html"), "r") as f:
    HTML_PAGE = f.read()


def handler(event, context):
    path = event.get("rawPath", "/")
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    # 根路径 — 返回前端页面
    if path == "/" and method == "GET":
        return {"statusCode": 200, "headers": {"Content-Type": "text/html; charset=utf-8"}, "body": HTML_PAGE}

    # 健康检查
    if path in ("/ping", "/api/health"):
        return {"statusCode": 200, "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"status": "ok"})}

    # POST /api/chat
    if method == "POST" and path in ("/api/chat", "/invocations"):
        try:
            body = event.get("body", "")
            if event.get("isBase64Encoded"):
                body = base64.b64decode(body).decode()
            data = json.loads(body) if body else {}
            prompt = data.get("prompt") or data.get("message") or ""
            if not prompt:
                return _json(400, {"error": "missing prompt or message"})

            # 从请求中获取 session_id，保持多轮对话上下文
            session_id = data.get("session_id") or event.get("headers", {}).get("x-session-id") or "default-session-xxxxxxxxxxxxxxxx"
            resp = client.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN, runtimeSessionId=session_id,
                qualifier="DEFAULT", payload=json.dumps({"prompt": prompt}).encode())
            result = json.loads(resp["response"].read().decode())
            return _json(200, result)
        except Exception as e:
            return _json(500, {"error": str(e)})

    # CORS preflight
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": _cors(), "body": ""}

    return _json(404, {"error": "not_found", "path": path})


def _cors():
    return {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"}

def _json(code, data):
    return {"statusCode": code, "headers": {"Content-Type": "application/json", **_cors()},
            "body": json.dumps(data, ensure_ascii=False)}
