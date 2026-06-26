import { config } from './config.js';

const claimEndsWith = (claim = {}, suffix = '') => (
  String(claim.typ || claim.type || '').toLowerCase().endsWith(suffix.toLowerCase())
);

export const getEasyAuthUser = (req) => {
  const encodedPrincipal = req.headers['x-ms-client-principal'];
  if (!encodedPrincipal) {
    return null;
  }

  try {
    const principal = JSON.parse(Buffer.from(encodedPrincipal, 'base64').toString('utf8'));
    const claims = Array.isArray(principal.claims) ? principal.claims : [];
    const emailClaim = claims.find((claim) => (
      claimEndsWith(claim, '/emailaddress')
      || claimEndsWith(claim, '/upn')
      || claim.typ === 'preferred_username'
      || claim.typ === 'email'
    ));
    const nameClaim = claims.find((claim) => (
      claimEndsWith(claim, '/name')
      || claim.typ === 'name'
    ));
    const roleClaims = claims.filter((claim) => (
      claimEndsWith(claim, '/role')
      || claim.typ === 'roles'
    ));

    return {
      id: principal.userId || principal.userDetails || emailClaim?.val || 'entra-user',
      email: emailClaim?.val || principal.userDetails || '',
      name: nameClaim?.val || principal.userDetails || emailClaim?.val || 'Entra User',
      roles: roleClaims.map((claim) => claim.val).filter(Boolean),
      provider: principal.auth_typ || principal.identityProvider || 'aad',
    };
  } catch (error) {
    console.error('Failed to parse X-MS-CLIENT-PRINCIPAL:', error);
    return null;
  }
};

export const getCurrentUser = (req) => {
  const easyAuthUser = getEasyAuthUser(req);
  if (easyAuthUser) {
    return easyAuthUser;
  }

  if (config.authMode === 'mock' || config.nodeEnv !== 'production') {
    return {
      id: 'dev-user',
      email: req.headers['x-dev-email'] || 'dev@example.com',
      name: req.headers['x-dev-name'] || 'Local Developer',
      roles: ['admin'],
      provider: 'mock',
    };
  }

  return null;
};

export const requireAuth = (req, res, next) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  req.user = user;
  next();
};
