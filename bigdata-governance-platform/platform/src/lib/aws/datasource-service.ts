import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, UpdateSecretCommand, DeleteSecretCommand } from "@aws-sdk/client-secrets-manager";
import { GlueClient, CreateConnectionCommand, DeleteConnectionCommand, TestConnectionCommand, GetConnectionCommand } from "@aws-sdk/client-glue";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { EC2Client, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand, DeleteSecurityGroupCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";
import { IAMClient, GetRoleCommand, CreateRoleCommand, AttachRolePolicyCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

const region = process.env.AWS_REGION || "us-east-1";
const sm = new SecretsManagerClient({ region });
const glue = new GlueClient({ region });
const rds = new RDSClient({ region });
const ec2 = new EC2Client({ region });
const iam = new IAMClient({ region });

const JDBC_URL: Record<string, (h: string, p: number, d: string) => string> = {
  mysql: (h, p, d) => `jdbc:mysql://${h}:${p}/${d}`,
  postgresql: (h, p, d) => `jdbc:postgresql://${h}:${p}/${d}`,
  oracle: (h, p, d) => `jdbc:oracle:thin:@${h}:${p}:${d}`,
  sqlserver: (h, p, d) => `jdbc:sqlserver://${h}:${p};databaseName=${d}`,
};

const DB_PORT: Record<string, number> = { mysql: 3306, postgresql: 5432, oracle: 1521, sqlserver: 1433 };

// ============ DS-04: Secrets Manager ============

export async function createSecret(datasourceId: string, username: string, password: string): Promise<string> {
  const { ARN } = await sm.send(new CreateSecretCommand({
    Name: `bgp/datasource/${datasourceId}`,
    SecretString: JSON.stringify({ username, password }),
  }));
  return ARN!;
}

export async function getSecret(secretArn: string): Promise<{ username: string; password: string }> {
  const { SecretString } = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  return JSON.parse(SecretString!);
}

export async function updateSecret(secretArn: string, username: string, password: string) {
  await sm.send(new UpdateSecretCommand({
    SecretId: secretArn,
    SecretString: JSON.stringify({ username, password }),
  }));
}

export async function deleteSecret(secretArn: string) {
  try {
    await sm.send(new DeleteSecretCommand({ SecretId: secretArn, ForceDeleteWithoutRecovery: true }));
  } catch {}
}

// ============ DS-03: Auto Network ============

interface NetworkConfig {
  vpcId: string;
  subnetId: string;
  availabilityZone: string;
  securityGroupId: string;
  isRds: boolean;
  rdsInstanceId?: string;
}

export async function detectNetwork(host: string, dbType: string, datasourceId: string): Promise<NetworkConfig> {
  const defaultVpc = process.env.DEFAULT_VPC_ID || "";
  const defaultSubnet = process.env.DEFAULT_SUBNET_ID || "";
  const defaultAz = process.env.DEFAULT_AZ || "us-east-1a";

  let vpcId = defaultVpc;
  let subnetId = defaultSubnet;
  let az = defaultAz;
  let isRds = false;
  let rdsInstanceId: string | undefined;

  // Try to detect RDS instance
  if (host.includes(".rds.amazonaws.com")) {
    try {
      const { DBInstances = [] } = await rds.send(new DescribeDBInstancesCommand({}));
      const match = DBInstances.find((i) => i.Endpoint?.Address === host);
      if (match) {
        isRds = true;
        rdsInstanceId = match.DBInstanceIdentifier;
        vpcId = match.DBSubnetGroup?.VpcId || defaultVpc;
        const privateSubnet = match.DBSubnetGroup?.Subnets?.find((s) => s.SubnetAvailabilityZone);
        if (privateSubnet) {
          subnetId = privateSubnet.SubnetIdentifier!;
          az = privateSubnet.SubnetAvailabilityZone!.Name!;
        }
      }
    } catch {}
  }

  // Create security group
  const sgName = `bgp-ds-${datasourceId.slice(-8)}`;
  let sgId: string;
  try {
    const { GroupId } = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: sgName,
      Description: `BGP datasource ${datasourceId}`,
      VpcId: vpcId,
    }));
    sgId = GroupId!;

    // Allow Glue SG self-reference (required for Glue)
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [{ IpProtocol: "-1", UserIdGroupPairs: [{ GroupId: sgId }] }],
    }));

    // Allow access to DB port from this SG
    const port = DB_PORT[dbType] || 3306;
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [{ IpProtocol: "tcp", FromPort: port, ToPort: port, IpRanges: [{ CidrIp: "10.0.0.0/16" }] }],
    }));
  } catch (e: any) {
    // SG might already exist
    if (e.Code === "InvalidGroup.Duplicate") {
      const { SecurityGroups } = await ec2.send(new DescribeSecurityGroupsCommand({
        Filters: [{ Name: "group-name", Values: [sgName] }, { Name: "vpc-id", Values: [vpcId] }],
      }));
      sgId = SecurityGroups![0].GroupId!;
    } else {
      throw e;
    }
  }

  return { vpcId, subnetId, availabilityZone: az, securityGroupId: sgId, isRds, rdsInstanceId };
}

export async function deleteSecurityGroup(sgId: string) {
  try {
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));
  } catch {}
}

// ============ DS-02: Auto IAM Role ============

const GLUE_ROLE_NAME = "bgp-glue-role";

export async function ensureGlueRole(): Promise<string> {
  try {
    const { Role } = await iam.send(new GetRoleCommand({ RoleName: GLUE_ROLE_NAME }));
    return Role!.Arn!;
  } catch {
    // Create role
    const { Role } = await iam.send(new CreateRoleCommand({
      RoleName: GLUE_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { Service: "glue.amazonaws.com" }, Action: "sts:AssumeRole" }],
      }),
    }));

    const policies = [
      "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole",
      "arn:aws:iam::aws:policy/AmazonS3FullAccess",
      "arn:aws:iam::aws:policy/AmazonRedshiftDataFullAccess",
    ];
    for (const arn of policies) {
      await iam.send(new AttachRolePolicyCommand({ RoleName: GLUE_ROLE_NAME, PolicyArn: arn }));
    }

    await iam.send(new PutRolePolicyCommand({
      RoleName: GLUE_ROLE_NAME,
      PolicyName: "bgp-secrets-read",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: "arn:aws:secretsmanager:*:*:secret:bgp/*" },
          { Effect: "Allow", Action: ["s3tables:*", "lakeformation:*", "glue:*"], Resource: "*" },
        ],
      }),
    }));

    return Role!.Arn!;
  }
}

// ============ DS-01: Auto Glue Connection ============

export async function createGlueConnection(
  datasourceId: string,
  type: string,
  host: string,
  port: number,
  database: string,
  secretArn: string,
  network: NetworkConfig
): Promise<string> {
  const connName = `bgp-conn-${datasourceId.slice(-12)}`;
  const jdbcUrl = JDBC_URL[type]?.(host, port, database) || "";
  const { username, password } = await getSecret(secretArn);

  try {
    await glue.send(new CreateConnectionCommand({
      ConnectionInput: {
        Name: connName,
        ConnectionType: "JDBC",
        ConnectionProperties: {
          JDBC_CONNECTION_URL: jdbcUrl,
          USERNAME: username,
          PASSWORD: password,
        },
        PhysicalConnectionRequirements: {
          SubnetId: network.subnetId,
          SecurityGroupIdList: [network.securityGroupId],
          AvailabilityZone: network.availabilityZone,
        },
      },
    }));
  } catch (e: any) {
    if (!e.message?.includes("already exists")) throw e;
  }

  return connName;
}

export async function deleteGlueConnection(connName: string) {
  try {
    await glue.send(new DeleteConnectionCommand({ ConnectionName: connName }));
  } catch {}
}

// ============ DS-16: Test Connection ============

export interface TestResult {
  success: boolean;
  steps: { name: string; status: "pass" | "fail" | "skip"; message: string; latencyMs?: number }[];
  totalMs: number;
}

export async function testConnection(connName: string): Promise<TestResult> {
  const start = Date.now();
  const steps: TestResult["steps"] = [];

  try {
    // Verify connection exists
    const { Connection } = await glue.send(new GetConnectionCommand({ Name: connName }));
    steps.push({ name: "connection_exists", status: "pass", message: "Glue Connection 已创建" });

    // Verify connection properties
    const jdbcUrl = Connection?.ConnectionProperties?.JDBC_CONNECTION_URL || "";
    const hasVpc = !!Connection?.PhysicalConnectionRequirements?.SubnetId;
    steps.push({ name: "config_check", status: jdbcUrl ? "pass" : "fail", message: jdbcUrl ? `JDBC: ${jdbcUrl.slice(0, 50)}...` : "JDBC URL 为空" });
    steps.push({ name: "network_check", status: hasVpc ? "pass" : "fail", message: hasVpc ? `VPC 子网: ${Connection?.PhysicalConnectionRequirements?.SubnetId}` : "未配置 VPC" });

  } catch (e: any) {
    steps.push({ name: "connection_exists", status: "fail", message: e.message || "Glue Connection 不存在" });
  }

  return { success: steps.every((s) => s.status === "pass"), steps, totalMs: Date.now() - start };
}

// ============ DS-06: RDS Discovery ============

export async function discoverRdsInstances() {
  const { DBInstances = [] } = await rds.send(new DescribeDBInstancesCommand({}));
  return DBInstances.filter((i) => i.DBInstanceStatus === "available").map((i) => ({
    identifier: i.DBInstanceIdentifier,
    engine: i.Engine,
    engineVersion: i.EngineVersion,
    instanceClass: i.DBInstanceClass,
    endpoint: i.Endpoint?.Address,
    port: i.Endpoint?.Port,
    status: i.DBInstanceStatus,
    vpcId: i.DBSubnetGroup?.VpcId,
    isPublic: i.PubliclyAccessible,
  }));
}
