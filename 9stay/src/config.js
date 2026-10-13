const env = process.env;

export const config = {
  production: env.NODE_ENV === 'production',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:stay@localhost:5441/stay',
};
