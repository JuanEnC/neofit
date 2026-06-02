import * as cdk from 'aws-cdk-lib';
import { NeoFitInfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

const environment = app.node.tryGetContext('environment') || 'dev';

new NeoFitInfrastructureStack(app, `NeoFit-Stack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: `NeoFit Infrastructure Stack - ${environment}`,
});

app.synth();
