export function parseAllowedDevOrigins(value) {
  const hosts = value
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return hosts?.length ? hosts : undefined;
}

export const adminNextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jdm/shared'],
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
  },
  allowedDevOrigins: parseAllowedDevOrigins(process.env.ALLOWED_DEV_ORIGINS),
  // Shared packages use NodeNext-style `./foo.js` imports in `.ts` source so the
  // API's NodeNext typecheck can resolve them. Teach webpack to fall back to
  // `.ts`/`.tsx` for those specifiers. Turbopack has no equivalent hook yet, so
  // `scripts.build` opts into `next build --webpack`.
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return webpackConfig;
  },
};
