import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { UsersFunction } from './lambdas/users-function';

export class NeoFitInfrastructureStack extends cdk.Stack {
  public readonly cognitoUserPool: cognito.UserPool;
  public readonly cognitoUserPoolClient: cognito.UserPoolClient;
  public readonly dynamodbTable: dynamodb.Table;
  public readonly apiGateway: apigatewayv2.HttpApi;
  public readonly lambdaRole: iam.Role;
  public readonly s3Bucket: s3.Bucket;
  public readonly dlqQueue: sqs.Queue;
  public readonly notificationQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const projectName = 'NeoFit';
    const environment = this.node.tryGetContext('environment') || 'dev';

    // ── Cognito User Pool ──────────────────────────────────────────────────

    this.cognitoUserPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${projectName}-UserPool-${environment}`,
      selfSignUpEnabled: true,
      standardAttributes: {
        email: { required: true, mutable: false },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      signInAliases: { email: true, username: false },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.cognitoUserPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.cognitoUserPool,
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { implicitCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      },
      preventUserExistenceErrors: true,
    });

    // ── DynamoDB Table ─────────────────────────────────────────────────────

    this.dynamodbTable = new dynamodb.Table(this, 'MasterTable', {
      tableName: `${projectName}_MasterTable_${environment}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environment === 'prod',
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    cdk.Tags.of(this.dynamodbTable).add('Project', projectName);
    cdk.Tags.of(this.dynamodbTable).add('Environment', environment);

    this.dynamodbTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.dynamodbTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'EntityType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'Timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // ── S3 Bucket ──────────────────────────────────────────────────────────

    this.s3Bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${projectName.toLowerCase()}-frontend-${environment}-${cdk.Stack.of(this).account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── Lambda Execution Role ──────────────────────────────────────────────

    this.lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `${projectName}-LambdaRole-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role shared by all NeoFit Lambda functions',
    });

    this.lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [this.dynamodbTable.tableArn, `${this.dynamodbTable.tableArn}/index/*`],
      })
    );

    this.lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminUpdateUserAttributes',
        ],
        resources: [this.cognitoUserPool.userPoolArn],
      })
    );

    this.lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: ['arn:aws:sqs:*:*:*'],
      })
    );

    this.lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/neofit/*`],
      })
    );

    // ── SQS Queues ─────────────────────────────────────────────────────────

    this.dlqQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${projectName}-DLQ-${environment}`,
      retentionPeriod: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: `${projectName}-NotificationQueue-${environment}`,
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: { queue: this.dlqQueue, maxReceiveCount: 3 },
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // ── API Gateway HTTP API ───────────────────────────────────────────────

    this.apiGateway = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `${projectName}-Api-${environment}`,
      description: 'NeoFit HTTP API Gateway',
      corsPreflight: {
        allowOrigins: this.getCorsOrigins(environment),
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        exposeHeaders: ['X-Total-Count'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // ── EventBridge Cron ───────────────────────────────────────────────────

    const notificationRule = new events.Rule(this, 'DailyNotificationRule', {
      ruleName: `${projectName}-DailyNotification-${environment}`,
      description: 'Trigger daily notification checks at 6:00 AM UTC-6',
      schedule: events.Schedule.cron({
        hour: '12',
        minute: '0',
        day: '*',
        month: '*',
      }),
    });

    notificationRule.addTarget(
      new targets.SqsQueue(this.notificationQueue, {
        deadLetterQueue: this.dlqQueue,
        maxEventAge: cdk.Duration.hours(2),
        retryAttempts: 2,
      })
    );

    // ── CloudWatch Log Groups ──────────────────────────────────────────────

    new logs.LogGroup(this, 'ApiGatewayLogGroup', {
      logGroupName: `/aws/apigateway/${projectName}-${environment}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda Functions ───────────────────────────────────────────────────

    // Users microservice — all /users/* routes
    new UsersFunction(this, 'UsersFunction', {
      environment,
      dynamoTableName: this.dynamodbTable.tableName,
      lambdaRole: this.lambdaRole,
      httpApi: this.apiGateway,
      userPool: this.cognitoUserPool,
      userPoolClient: this.cognitoUserPoolClient,
    });

    // ── Stack Outputs ──────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: this.cognitoUserPool.userPoolId,
      exportName: `${projectName}-UserPoolId-${environment}`,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: this.cognitoUserPoolClient.userPoolClientId,
      exportName: `${projectName}-ClientId-${environment}`,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.apiGateway.url ?? 'TBD',
      exportName: `${projectName}-ApiUrl-${environment}`,
      description: 'API Gateway HTTP API URL',
    });

    new cdk.CfnOutput(this, 'DynamoDbTableName', {
      value: this.dynamodbTable.tableName,
      exportName: `${projectName}-TableName-${environment}`,
      description: 'DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: this.s3Bucket.bucketName,
      exportName: `${projectName}-BucketName-${environment}`,
      description: 'S3 Bucket Name for frontend assets',
    });

    new cdk.CfnOutput(this, 'LambdaRoleArn', {
      value: this.lambdaRole.roleArn,
      exportName: `${projectName}-LambdaRoleArn-${environment}`,
      description: 'Lambda Execution Role ARN',
    });

    new cdk.CfnOutput(this, 'NotificationQueueUrl', {
      value: this.notificationQueue.queueUrl,
      exportName: `${projectName}-NotificationQueueUrl-${environment}`,
      description: 'SQS Notification Queue URL',
    });
  }

  private getCorsOrigins(environment: string): string[] {
    if (environment === 'prod') {
      return ['https://neofit.com', 'https://app.neofit.com'];
    }
    return ['http://localhost:3000', 'http://localhost:3001'];
  }
}
