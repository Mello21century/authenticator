// Expo's default config already understands pnpm/npm workspaces (packages/shared is TS source).
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
