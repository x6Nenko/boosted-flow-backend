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
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
});
