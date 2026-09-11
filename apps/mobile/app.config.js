/**
 * Dynamic config so the web export can be served from a subpath.
 *
 * GitHub Pages serves a project site at /<repo-name>/, but expo-router emits
 * absolute asset and route paths. Without a matching baseUrl every request 404s
 * against the user site root. The deploy workflow sets EXPO_BASE_URL from the
 * repository name so this works whatever the repo is called; local development
 * leaves it empty and serves from /.
 */
const baseUrl = process.env.EXPO_BASE_URL ?? '';

module.exports = {
  expo: {
    name: 'MOOV',
    slug: 'moov',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'moov',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    backgroundColor: '#07080B',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.moov.app',
    },
    android: {
      package: 'com.moov.app',
      edgeToEdgeEnabled: true,
    },
    web: {
      bundler: 'metro',
      output: 'single',
    },
    plugins: ['expo-router'],
    experiments: {
      typedRoutes: false,
      baseUrl,
    },
  },
};
