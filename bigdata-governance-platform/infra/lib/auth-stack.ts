import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly client: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "BgpUserPool", {
      userPoolName: "bgp-user-pool",
      selfSignUpEnabled: false,
      signInAliases: { username: true, email: true },
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true, requireUppercase: false, requireSymbols: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.client = this.userPool.addClient("BgpWebClient", {
      authFlows: { userPassword: true, userSrp: true },
      preventUserExistenceErrors: true,
    });

    // RBAC groups
    for (const group of ["bgp-admin", "bgp-developer", "bgp-viewer"]) {
      new cognito.CfnUserPoolGroup(this, group, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
        description: `${group} role`,
      });
    }

    // Auto-create admin user
    const createAdmin = new cr.AwsCustomResource(this, "CreateAdminUser", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminCreateUser",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin",
          TemporaryPassword: "Admin123!",
          MessageAction: "SUPPRESS",
          UserAttributes: [{ Name: "email", Value: "admin@bgp.local" }, { Name: "email_verified", Value: "true" }],
        },
        physicalResourceId: cr.PhysicalResourceId.of("admin-user"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({ actions: ["cognito-idp:*"], resources: [this.userPool.userPoolArn] }),
      ]),
    });

    // Set permanent password
    const setPassword = new cr.AwsCustomResource(this, "SetAdminPassword", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminSetUserPassword",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin",
          Password: "Admin123!",
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of("admin-password"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({ actions: ["cognito-idp:*"], resources: [this.userPool.userPoolArn] }),
      ]),
    });
    setPassword.node.addDependency(createAdmin);

    // Add admin to bgp-admin group
    const addToGroup = new cr.AwsCustomResource(this, "AddAdminToGroup", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminAddUserToGroup",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin",
          GroupName: "bgp-admin",
        },
        physicalResourceId: cr.PhysicalResourceId.of("admin-group"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({ actions: ["cognito-idp:*"], resources: [this.userPool.userPoolArn] }),
      ]),
    });
    addToGroup.node.addDependency(setPassword);

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "ClientId", { value: this.client.userPoolClientId });
  }
}
