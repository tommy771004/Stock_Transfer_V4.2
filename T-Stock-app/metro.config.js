const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .html and .css files as static assets
// (needed for loading the Vite-built index.html inside WebView)
config.resolver.assetExts.push('html', 'css');

// Watch the parent dist-mobile folder so metro picks up web bundle changes
config.watchFolders = [
  path.resolve(__dirname, '..', 'dist-mobile'),
];

module.exports = config;
