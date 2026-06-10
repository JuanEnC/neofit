/**
 * Users Lambda CDK Construct
 *
 * Provisions the NodejsFunction for the users microservice and wires
 * it to the existing API Gateway HTTP API with JWT authorization.
 */

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface UsersFunctionProps {
  environment: string;
  dynamoTableName: string;
  lambdaRole: iam.IRole;
  httpApi: apigatewayv2.HttpApi;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

export class UsersFunction extends Construct {
  public readonly function: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: UsersFunctionProps) {
    super(scope, id);

    const { environment, dynamoTableName, lambdaRole, httpApi, userPool, userPoolClient } = props;

    // ── Lambda Function ─────────────────────────────────────────────────────

    this.function = new lambdaNode.NodejsFunction(this, 'Function', {
      functionName: `NeoFit-UsersService-${environment}`,
      description: 'NeoFit Users microservice — handles user CRUD and status management',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../../backend/src/lambdas/users/handler.ts'),
      handler: 'handler',
      // projectRoot must contain the entry file — set to monorepo root
      projectRoot: path.join(__dirname, '../../..'),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(15),
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
        // Point esbuild to the backend tsconfig, not the infrastructure one
        tsconfig: path.join(__dirname, '../../../backend/tsconfig.json'),
      },
      logGroup: new logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/NeoFit-UsersService-${environment}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    // ── JWT Authorizer ───────────────────────────────────────────────────────

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.us-east-1.amazonaws.com/${userPool.userPoolId}`,
      {
        authorizerName: `NeoFit-JwtAuthorizer-${environment}`,
        jwtAudience: [userPoolClient.userPoolClientId],
        identitySource: ['$request.header.Authorization'],
      }
    );

    const integration = new integrations.HttpLambdaIntegration('UsersIntegration', this.function);

    // ── API Gateway Routes ───────────────────────────────────────────────────

    const routeDefaults = {
      integration,
      authorizer: jwtAuthorizer,
    };

    // Admin-only routes
    httpApi.addRoutes({ path: '/users', methods: [apigatewayv2.HttpMethod.GET], ...routeDefaults });
    httpApi.addRoutes({
      path: '/users/search',
      methods: [apigatewayv2.HttpMethod.GET],
      ...routeDefaults,
    });

    // Self-or-admin routes
    httpApi.addRoutes({
      path: '/users/{id}',
      methods: [apigatewayv2.HttpMethod.GET],
      ...routeDefaults,
    });
    httpApi.addRoutes({
      path: '/users/{id}',
      methods: [apigatewayv2.HttpMethod.PUT],
      ...routeDefaults,
    });
    httpApi.addRoutes({
      path: '/users/{id}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      ...routeDefaults,
    });

    // Admin status management
    httpApi.addRoutes({
      path: '/users/{id}/status',
      methods: [apigatewayv2.HttpMethod.PATCH],
      ...routeDefaults,
    });

    // ── Outputs ─────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Users Lambda function ARN',
      exportName: `NeoFit-UsersFunction-${environment}`,
    });
  }
}
