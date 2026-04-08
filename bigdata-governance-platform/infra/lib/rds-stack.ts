import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class RdsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const sg = new ec2.SecurityGroup(this, "RdsSg", {
      vpc: props.vpc,
      description: "BGP Source MySQL SG",
    });
    sg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(3306));

    const instance = new rds.DatabaseInstance(this, "BgpSourceMysql", {
      instanceIdentifier: "bgp-source-mysql",
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
      databaseName: "ecommerce",
      credentials: rds.Credentials.fromGeneratedSecret("admin"),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    // Lambda to init test data (runs in VPC to reach RDS)
    const initFn = new lambda.Function(this, "InitRdsData", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
import json, pymysql, cfnresponse
def handler(event, context):
  if event.get("RequestType") == "Delete":
    cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
    return
  try:
    props = event["ResourceProperties"]
    conn = pymysql.connect(host=props["Host"], user=props["User"], password=props["Password"], database=props["Database"], connect_timeout=10)
    cur = conn.cursor()
    for sql in [
      """CREATE TABLE IF NOT EXISTS orders (id INT AUTO_INCREMENT PRIMARY KEY, order_no VARCHAR(32) NOT NULL, customer_name VARCHAR(100) NOT NULL, product VARCHAR(200) NOT NULL, quantity INT NOT NULL DEFAULT 1, amount DECIMAL(10,2) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', order_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)""",
      """CREATE TABLE IF NOT EXISTS customers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(200), phone VARCHAR(20), city VARCHAR(50), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
      """CREATE TABLE IF NOT EXISTS products (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(200) NOT NULL, category VARCHAR(50), price DECIMAL(10,2) NOT NULL, stock INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
      """INSERT IGNORE INTO customers (id,name,email,phone,city) VALUES (1,'张三','zhangsan@example.com','13800001111','北京'),(2,'李四','lisi@example.com','13800002222','上海'),(3,'王五','wangwu@example.com','13800003333','广州'),(4,'赵六','zhaoliu@example.com','13800004444','深圳'),(5,'钱七','qianqi@example.com','13800005555','杭州')""",
      """INSERT IGNORE INTO products (id,name,category,price,stock) VALUES (1,'笔记本电脑','电子产品',6999.00,100),(2,'无线鼠标','电子产品',129.00,500),(3,'机械键盘','电子产品',399.00,300),(4,'显示器','电子产品',2499.00,80),(5,'办公椅','家具',899.00,150)""",
      """INSERT IGNORE INTO orders (id,order_no,customer_name,product,quantity,amount,status,order_date) VALUES (1,'ORD-001','张三','笔记本电脑',1,6999.00,'completed','2026-04-01'),(2,'ORD-002','李四','无线鼠标',2,258.00,'completed','2026-04-01'),(3,'ORD-003','王五','机械键盘',1,399.00,'shipped','2026-04-02'),(4,'ORD-004','赵六','显示器',1,2499.00,'shipped','2026-04-02'),(5,'ORD-005','钱七','办公椅',2,1798.00,'pending','2026-04-03')""",
    ]:
      cur.execute(sql)
    conn.commit()
    conn.close()
    cfnresponse.send(event, context, cfnresponse.SUCCESS, {"tables": "orders,customers,products"})
  except Exception as e:
    cfnresponse.send(event, context, cfnresponse.FAILED, {"error": str(e)})
`),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
      timeout: cdk.Duration.seconds(60),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(this, "PyMysqlLayer",
          `arn:aws:lambda:${cdk.Stack.of(this).region}:770693421928:layer:Klayers-p312-pymysql:5`
        ),
      ],
    });

    // Custom Resource to trigger init
    const initData = new cdk.CustomResource(this, "InitData", {
      serviceToken: initFn.functionArn,
      properties: {
        Host: instance.dbInstanceEndpointAddress,
        User: "admin",
        Password: instance.secret!.secretValueFromJson("password").unsafeUnwrap(),
        Database: "ecommerce",
        Version: "1", // change to re-trigger
      },
    });
    initData.node.addDependency(instance);

    new cdk.CfnOutput(this, "RdsEndpoint", { value: instance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "RdsPort", { value: instance.dbInstanceEndpointPort });
    new cdk.CfnOutput(this, "RdsSecretArn", { value: instance.secret!.secretArn });
  }
}
