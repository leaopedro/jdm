// Per-file setup. Assumes global-setup.ts has started the test DB and set DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.GIT_SHA = 'test';
process.env.CORS_ORIGINS = '';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
process.env.REFRESH_TOKEN_PEPPER = 'b'.repeat(48);
process.env.APP_WEB_BASE_URL = 'http://localhost:3000';
process.env.MAIL_FROM = 'noreply@jdm.test';
