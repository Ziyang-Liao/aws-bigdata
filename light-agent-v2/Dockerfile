FROM --platform=linux/arm64 python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
# BedrockAgentCoreApp 自动处理 /ping + /invocations
# OTel 自动 instrumentation 通过 opentelemetry-instrument 启动
CMD ["opentelemetry-instrument", "python", "server.py"]
