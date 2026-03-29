import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
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

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "ClientId", { value: this.client.userPoolClientId });
  }
}
