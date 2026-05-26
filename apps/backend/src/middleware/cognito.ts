import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { env } from '../env.js';

// Cognito JWT verification.
// Tokens are RS256-signed; the public keys come from the user pool's
// well-known JWKS URL. createRemoteJWKSet handles fetching + 10-minute
// caching + automatic refresh on unknown `kid`.

function cognitoConfig(): {
  issuer: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  clientId: string;
  tokenUse: 'access' | 'id';
} {
  const poolId = env.COGNITO_USER_POOL_ID;
  const clientId = env.COGNITO_CLIENT_ID;
  if (!poolId || !clientId) {
    throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set when AUTH_MODE=cognito');
  }
  const issuer = `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/${poolId}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return { issuer, jwks, clientId, tokenUse: env.COGNITO_TOKEN_USE };
}

// Lazy singleton — only set up the JWKS fetcher when we're actually in cognito mode.
let configCache: ReturnType<typeof cognitoConfig> | null = null;
function config() {
  configCache ??= cognitoConfig();
  return configCache;
}

export interface CognitoClaims {
  sub: string;
  email?: string;
  'cognito:username'?: string;
  // Custom group claim — Cognito groups the user belongs to. Map "admin"
  // group → role admin; everyone else is "user".
  'cognito:groups'?: string[];
}

export async function verifyCognitoJwt(token: string): Promise<{
  sub: string;
  email: string;
  role: 'user' | 'admin';
}> {
  const { issuer, jwks, clientId, tokenUse } = config();

  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    // Access tokens have `client_id` claim (not `aud`); ID tokens have `aud`.
    // jose's `audience` option only checks `aud`, so for access tokens we
    // validate client_id manually below.
    audience: tokenUse === 'id' ? clientId : undefined,
  });

  if (payload['token_use'] !== tokenUse) {
    throw new Error(`Expected token_use=${tokenUse}, got ${payload['token_use']}`);
  }

  if (tokenUse === 'access' && payload['client_id'] !== clientId) {
    throw new Error('Token client_id does not match COGNITO_CLIENT_ID');
  }

  const claims = payload as JWTPayload & CognitoClaims;
  if (!claims.sub) {
    throw new Error('Token missing sub claim');
  }

  const groups = claims['cognito:groups'] ?? [];
  const role: 'user' | 'admin' = groups.includes('admin') ? 'admin' : 'user';

  // Access tokens don't carry the email claim by default. Callers that need
  // an email can either request the `email` scope on the token or look the
  // user up by `sub` in the local users table.
  const email = (claims.email as string | undefined) ?? '';

  return { sub: claims.sub, email, role };
}
