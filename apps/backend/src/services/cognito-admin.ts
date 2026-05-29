import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminDisableUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '../env.js';

// Admin (privileged) Cognito operations used by the moderation surface. These
// require IAM permissions on the running instance role — see the Terraform
// instance-role policy. The DB user id equals the Cognito `sub`, which is the
// auto-generated Username for our email-alias pool, so it doubles as the
// Cognito Username for Admin* APIs.

const ADMIN_GROUP = 'admin';

let _client: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  _client ??= new CognitoIdentityProviderClient({ region: env.COGNITO_REGION });
  return _client;
}

function poolId(): string {
  if (!env.COGNITO_USER_POOL_ID) {
    throw new Error('COGNITO_USER_POOL_ID must be set when AUTH_MODE=cognito');
  }
  return env.COGNITO_USER_POOL_ID;
}

export async function setAdminGroup(userId: string, isAdmin: boolean): Promise<void> {
  const Command = isAdmin ? AdminAddUserToGroupCommand : AdminRemoveUserFromGroupCommand;
  await client().send(
    new Command({ UserPoolId: poolId(), Username: userId, GroupName: ADMIN_GROUP }),
  );
}

export async function disableUser(userId: string): Promise<void> {
  await client().send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: userId }));
}

export async function deleteUser(userId: string): Promise<void> {
  await client().send(new AdminDeleteUserCommand({ UserPoolId: poolId(), Username: userId }));
}
