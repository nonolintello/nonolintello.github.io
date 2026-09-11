const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro must watch the whole workspace, or edits to @ai/core won't trigger a
// rebuild and the app will silently run against stale analytics.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// @ai/core is published as TypeScript source rather than a build artefact, so
// there is no compile step between editing an algorithm and seeing it run.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
