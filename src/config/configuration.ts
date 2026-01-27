export default () => ({
  database: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '1h',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
    rotationPeriod: process.env.JWT_ROTATION_PERIOD || '1h',
    cookieMaxAge: process.env.JWT_COOKIE_MAX_AGE || '30d',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  session: {
    secret: process.env.SESSION_SECRET,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  plunk: {
    secretKey: process.env.PLUNK_SECRET_KEY,
    fromEmail: process.env.PLUNK_FROM_EMAIL,
  },
});
