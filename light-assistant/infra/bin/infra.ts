#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();
new InfraStack(app, 'FrontendStack', {
  env: { account: '774868049561', region: 'us-east-1' },
});
