const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/plugin');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });
