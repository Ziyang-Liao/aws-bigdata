#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AuthStack } from "../lib/auth-stack";
import { RedshiftStack } from "../lib/redshift-stack";
import { RdsStack } from "../lib/rds-stack";
import { MwaaStack } from "../lib/mwaa-stack";
import { PlatformStack } from "../lib/platform-stack";
import { OpenMetadataStack } from "../lib/openmetadata-stack";
import { OmDatabaseStack } from "../lib/om-database-stack";
import { OmSearchStack } from "../lib/om-search-stack";
import { OmServiceStack } from "../lib/om-service-stack";

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION || "us-east-1" };

const vpc = new VpcStack(app, "BgpVpcStack", { env });
new DatabaseStack(app, "BgpDatabaseStack", { env });
const auth = new AuthStack(app, "BgpAuthStack", { env });
new RedshiftStack(app, "BgpRedshiftStack", { env, vpc: vpc.vpc });
new RdsStack(app, "BgpRdsStack", { env, vpc: vpc.vpc });
const platform = new PlatformStack(app, "BgpPlatformStack", {
  env,
  vpc: vpc.vpc,
  cognitoUserPoolId: auth.userPool.userPoolId,
  cognitoClientId: auth.client.userPoolClientId,
});
new MwaaStack(app, "BgpMwaaStack", {
  env,
  vpc: vpc.vpc,
  dagBucketArn: platform.dagBucket.bucketArn,
  albSecurityGroup: platform.albSecurityGroup,
});

new OpenMetadataStack(app, "BgpOpenMetadataStack", { env, vpc: vpc.vpc });

const omDb = new OmDatabaseStack(app, "BgpOmDatabaseStack", { env, vpc: vpc.vpc });
const omSearch = new OmSearchStack(app, "BgpOmSearchStack", { env, vpc: vpc.vpc });
new OmServiceStack(app, "BgpOmServiceStack", {
  env, vpc: vpc.vpc, db: omDb.db, searchEndpoint: omSearch.domain.domainEndpoint,
});
