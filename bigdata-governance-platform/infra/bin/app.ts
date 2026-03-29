#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AuthStack } from "../lib/auth-stack";
import { RedshiftStack } from "../lib/redshift-stack";
import { PlatformStack } from "../lib/platform-stack";

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION || "us-east-1" };

const vpc = new VpcStack(app, "BgpVpcStack", { env });
new DatabaseStack(app, "BgpDatabaseStack", { env });
new AuthStack(app, "BgpAuthStack", { env });
new RedshiftStack(app, "BgpRedshiftStack", { env, vpc: vpc.vpc });
new PlatformStack(app, "BgpPlatformStack", { env, vpc: vpc.vpc });
