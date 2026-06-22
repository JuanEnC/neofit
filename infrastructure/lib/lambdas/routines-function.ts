/**
 * Routines Lambda CDK Construct
 *
 * Provisions the Routines microservice and wires its routes to the
 * existing API Gateway HTTP API with JWT authorization.
 * The JWT authorizer is created once in the stack and passed as a prop
 * to avoid CDK construct ID conflicts when multiple services share the same API.
 */

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface RoutinesFunctionProps {
  environment: string;
  dynamoTableName: string;
  lambdaRole: iam.IRole;
  httpApi: apigatewayv2.HttpApi;
  jwtAuthorizer: authorizers.HttpJwtAuthorizer;
}

export class RoutinesFunction extends Construct {
  public readonly function: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: RoutinesFunctionProps) {
    super(scope, id);

    const { environment, dynamoTableName, lambdaRole, httpApi, jwtAuthorizer } = props;

    // ── Lambda Function ─────────────────────────────────────────────────────

    this.function = new lambdaNode.NodejsFunction(this, 'Handler', {
      functionName: `NeoFit-RoutinesService-${environment}`,
      description: 'NeoFit Routines microservice — exercise catalog management',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../../backend/src/lambdas/routines/handler.ts'),
      handler: 'handler',
      // projectRoot must contain the entry file — set to monorepo root
      projectRoot: path.join(__dirname, '../../..'),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
      environment: {
        TABLE_NAME: dynamoTableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
        // Point esbuild to the backend tsconfig, not the infrastructure one
        tsconfig: path.join(__dirname, '../../../backend/tsconfig.json'),
      },
      logGroup: new logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/NeoFit-RoutinesService-${environment}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    const integration = new integrations.HttpLambdaIntegration(
      'RoutinesIntegration',
      this.function
    );

    // ── API Gateway Routes ───────────────────────────────────────────────────

    const routeDefaults = {
      integration,
      authorizer: jwtAuthorizer,
    };

    // Read routes — JWT required, accessible to all authenticated users
    httpApi.addRoutes({
      path: '/routines',
      methods: [apigatewayv2.HttpMethod.GET],
      ...routeDefaults,
    });

    httpApi.addRoutes({
      path: '/routines/group/{muscle}',
      methods: [apigatewayv2.HttpMethod.GET],
      ...routeDefaults,
    });

    // Write routes — JWT required, Admin-only enforced at controller level
    httpApi.addRoutes({
      path: '/routines',
      methods: [apigatewayv2.HttpMethod.POST],
      ...routeDefaults,
    });

    httpApi.addRoutes({
      path: '/routines/{muscle}/{id}',
      methods: [apigatewayv2.HttpMethod.PUT],
      ...routeDefaults,
    });

    httpApi.addRoutes({
      path: '/routines/{muscle}/{id}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      ...routeDefaults,
    });

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Routines Lambda function ARN',
      exportName: `NeoFit-RoutinesFunction-${environment}`,
    });
  }
}
