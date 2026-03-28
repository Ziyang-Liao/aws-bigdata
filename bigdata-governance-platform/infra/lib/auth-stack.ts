import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, "BgpUserPool", {
      userPoolName: "bgp-user-pool",
      selfSignUpEnabled: false,
      signInAliases: { username: true, email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
    });

    const roles = ["Admin", "Developer", "Analyst", "Viewer"];
    for (const role of roles) {
      new cognito.CfnUserPoolGroup(this, `Group${role}`, {
        userPoolId: userPool.userPoolId,
        groupName: role,
        description: `${role} role`,
      });
    }

    const client = userPool.addClient("BgpWebClient", {
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "ClientId", { value: client.userPoolClientId });
  }
}
