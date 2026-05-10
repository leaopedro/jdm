const { getDefaultConfig } = require('expo/metro-config');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot, { getDefaultConfig });
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Shared packages use NodeNext-style `.js` imports in `.ts` source. Strip the
// extension so Metro resolves the TypeScript file.
const defaultResolve = config.resolver.resolveRequest;
const stripeWebStub = path.resolve(projectRoot, 'src/stripe/web-stub.tsx');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Stripe RN is native-only. On web, alias every path under the package to
  // a stub so the bundle doesn't try to import codegenNativeCommands. Payment
  // hooks return a graceful error on web; the rest of the app renders normally.
  if (
    platform === 'web' &&
    (moduleName === '@stripe/stripe-react-native' ||
      moduleName.startsWith('@stripe/stripe-react-native/'))
  ) {
    return { type: 'sourceFile', filePath: stripeWebStub };
  }
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      const inner = (ctx, name, plat) =>
        defaultResolve ? defaultResolve(ctx, name, plat) : ctx.resolveRequest(ctx, name, plat);
      return inner(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to default resolution
    }
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: './tailwind.config.js',
});
