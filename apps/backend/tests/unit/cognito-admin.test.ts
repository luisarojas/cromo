import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every send() call so we can assert on the Command type and inputs.
const sendMock = vi.fn().mockResolvedValue({});

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  // Subclass-like factories: each returns an object whose constructor.name
  // matches the original. cognito-admin.ts uses `new <Command>(...)` and
  // passes the instance straight to client.send().
  class AdminAddUserToGroupCommand {
    constructor(public input: unknown) {}
  }
  class AdminRemoveUserFromGroupCommand {
    constructor(public input: unknown) {}
  }
  class AdminDisableUserCommand {
    constructor(public input: unknown) {}
  }
  class AdminDeleteUserCommand {
    constructor(public input: unknown) {}
  }
  class CognitoIdentityProviderClient {
    send = sendMock;
  }
  return {
    CognitoIdentityProviderClient,
    AdminAddUserToGroupCommand,
    AdminRemoveUserFromGroupCommand,
    AdminDisableUserCommand,
    AdminDeleteUserCommand,
  };
});

vi.mock('../../src/env.js', () => ({
  env: {
    COGNITO_REGION: 'ca-central-1',
    COGNITO_USER_POOL_ID: 'ca-central-1_TEST',
  },
}));

import {
  setAdminGroup,
  disableUser,
  deleteUser,
} from '../../src/services/cognito-admin.js';

beforeEach(() => {
  sendMock.mockClear();
});

describe('setAdminGroup', () => {
  it('uses AdminAddUserToGroupCommand when isAdmin=true', async () => {
    await setAdminGroup('user-1', true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0]![0] as { constructor: { name: string }; input: Record<string, string> };
    expect(cmd.constructor.name).toBe('AdminAddUserToGroupCommand');
    expect(cmd.input).toEqual({
      UserPoolId: 'ca-central-1_TEST',
      Username: 'user-1',
      GroupName: 'admin',
    });
  });

  it('uses AdminRemoveUserFromGroupCommand when isAdmin=false', async () => {
    await setAdminGroup('user-1', false);
    const cmd = sendMock.mock.calls[0]![0] as { constructor: { name: string } };
    expect(cmd.constructor.name).toBe('AdminRemoveUserFromGroupCommand');
  });
});

describe('disableUser', () => {
  it('sends an AdminDisableUserCommand', async () => {
    await disableUser('user-2');
    const cmd = sendMock.mock.calls[0]![0] as { constructor: { name: string }; input: Record<string, string> };
    expect(cmd.constructor.name).toBe('AdminDisableUserCommand');
    expect(cmd.input).toEqual({
      UserPoolId: 'ca-central-1_TEST',
      Username: 'user-2',
    });
  });
});

describe('deleteUser', () => {
  it('sends an AdminDeleteUserCommand', async () => {
    await deleteUser('user-3');
    const cmd = sendMock.mock.calls[0]![0] as { constructor: { name: string }; input: Record<string, string> };
    expect(cmd.constructor.name).toBe('AdminDeleteUserCommand');
    expect(cmd.input.Username).toBe('user-3');
  });
});
