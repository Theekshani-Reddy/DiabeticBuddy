import jwt from 'jsonwebtoken';

const issuer = 'sweety-api';
const audience = 'sweety-client';

export function createToken(userId, secret) {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: '1h',
    issuer,
    audience,
  });
}

export function verifyToken(token, secret) {
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer,
    audience,
    maxAge: '1h',
  });
}
