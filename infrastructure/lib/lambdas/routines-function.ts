/**
 * Routines Lambda CDK Construct
 *
 * Deploys the Routines Lambda and registers all /routines/* routes
 * on the shared HTTP API. The JWT authorizer is created once in the
 * stack and passed here as a prop to avoid CDK construct ID conflicts.
 */

import * as path from 'path';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { IRole } from 'aws-cdk-lib/aws-iam';

export interface RoutinesFunctionProps {
  environment: string;
  dynamoTableName: string;
  lambdaRole: IRole;
  httpApi: HttpApi;
  // Created once in the stack and passed as prop — never instantiated per-construct
  jwtAuthorizer: HttpJwtAuthorizer;
}

export class RoutinesFunction extends Construct {
  constructor(scope: Construct, id: string, props: RoutinesFunctionProps) {
    super(scope, id);

    const fn = new NodejsFunction(this, 'Handler', {
      // projectRoot must point to monorepo root for pnpm workspace resolution
      projectRoot: path.resolve(__dirname, '../../../'),
      entry: path.resolve(__dirname, '../../../backend/src/lambdas/routines/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      role: props.lambdaRole,
      timeout: Duration.seconds(29),
      memorySize: 256,
      bundling: {
        tsconfig: path.resolve(__dirname, '../../../backend/tsconfig.json'),
      },
      environment: {
        TABLE_NAME: props.dynamoTableName,
        ENVIRONMENT: props.environment,
      },
    });

    const integration = new HttpLambdaIntegration('RoutinesIntegration', fn);
    const authOptions = { authorizer: props.jwtAuthorizer };

    // Read routes — JWT required, accessible to all authenticated users
    props.httpApi.addRoutes({
      path: '/routines',
      methods: [HttpMethod.GET],
      integration,
      ...authOptions,
    });

    props.httpApi.addRoutes({
      path: '/routines/group/{muscle}',
      methods: [HttpMethod.GET],
      integration,
      ...authOptions,
    });

    // Write routes — JWT required, Admin-only enforced at controller level
    props.httpApi.addRoutes({
      path: '/routines',
      methods: [HttpMethod.POST],
      integration,
      ...authOptions,
    });

    props.httpApi.addRoutes({
      path: '/routines/{muscle}/{id}',
      methods: [HttpMethod.PUT],
      integration,
      ...authOptions,
    });

    props.httpApi.addRoutes({
      path: '/routines/{muscle}/{id}',
      methods: [HttpMethod.DELETE],
      integration,
      ...authOptions,
    });
  }
}
