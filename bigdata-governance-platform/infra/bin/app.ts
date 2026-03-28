#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";
import { DatabaseStack } from "../lib/database-stack";
import { AuthStack } from "../lib/auth-stack";

const app = new cdk.App();
const env = { region: "us-east-1" };

const vpc = new VpcStack(app, "BgpVpcStack", { env });
const db = new DatabaseStack(app, "BgpDatabaseStack", { env });
const auth = new AuthStack(app, "BgpAuthStack", { env });
