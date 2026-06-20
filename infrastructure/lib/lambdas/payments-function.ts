/**
 * Payments Lambda CDK Construct
 *
 * Provisions the Payments microservice and wires its routes to the
 * existing API Gateway HTTP API. The webhook route is registered
 * without a JWT authorizer — Stripe signature verification handles
 * authentication for that route at the application layer.
 *
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

interface PaymentsFunctionProps {
  environment: string;
  dynamoTableName: string;
  lambdaRole: iam.IRole;
  httpApi: apigatewayv2.HttpApi;
  jwtAuthorizer: authorizers.HttpJwtAuthorizer; // recibido del stack, no creado aquí
}

export class PaymentsFunction extends Construct {
  public readonly function: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: PaymentsFunctionProps) {
    super(scope, id);

    const { environment, dynamoTableName, lambdaRole, httpApi, jwtAuthorizer } = props;

    // ── Lambda Function ─────────────────────────────────────────────────────

    this.function = new lambdaNode.NodejsFunction(this, 'Function', {
      functionName: `NeoFit-PaymentsService-${environment}`,
      description: 'NeoFit Payments microservice — Stripe integration and payment records',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../../backend/src/lambdas/payments/handler.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../../..'),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(29),
      memorySize: 256,
      environment: {
        DYNAMODB_TABLE_NAME: dynamoTableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
        tsconfig: path.join(__dirname, '../../../backend/tsconfig.json'),
      },
      logGroup: new logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/NeoFit-PaymentsService-${environment}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    const integration = new integrations.HttpLambdaIntegration(
      'PaymentsIntegration',
      this.function
    );

    // ── API Gateway Routes ───────────────────────────────────────────────────

    // JWT-protected routes
    httpApi.addRoutes({
      path: '/payments/intent',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: jwtAuthorizer,
    });

    httpApi.addRoutes({
      path: '/payments/history/{userId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: jwtAuthorizer,
    });

    httpApi.addRoutes({
      path: '/payments/renewal/{userId}',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: jwtAuthorizer,
    });

    // Webhook route — no JWT authorizer, uses Stripe signature instead
    httpApi.addRoutes({
      path: '/payments/webhook',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
    });

    // ── Stack Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Payments Lambda function ARN',
      exportName: `NeoFit-PaymentsFunction-${environment}`,
    });
  }
}
