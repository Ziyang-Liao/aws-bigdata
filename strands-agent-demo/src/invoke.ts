/**
 * 调用 AgentCore 上的灯效控制 Agent
 */
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

const RUNTIME_ARN =
  "arn:aws:bedrock-agentcore:us-east-1:073090110765:runtime/light_control_agent-5mGnjk7jwJ";

const client = new BedrockAgentCoreClient({ region: "us-east-1" });

const testCases = [
  "帮我把客厅的灯打开",
  "把亮度调到80",
  "换成暖白色",
  "关灯",
];

for (const prompt of testCases) {
  console.log(`\n📝 用户: ${prompt}`);
  console.log("-".repeat(40));

  const cmd = new InvokeAgentRuntimeCommand({
    runtimeSessionId: `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    agentRuntimeArn: RUNTIME_ARN,
    qualifier: "DEFAULT",
    payload: new TextEncoder().encode(prompt),
  });

  const res = await client.send(cmd);
  const body = await res.response!.transformToString();
  const data = JSON.parse(body);

  console.log(`🤖 助手: ${JSON.stringify(data.response?.lastMessage || data.response, null, 2)}`);
  if (data.deviceState) {
    console.log(`💡 设备: ${JSON.stringify(data.deviceState)}`);
  }
}
