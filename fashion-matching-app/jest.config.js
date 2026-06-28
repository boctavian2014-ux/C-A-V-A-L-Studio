module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-reanimated|react-native-gesture-handler|react-native-camera|react-native-vision-camera|react-native-vision-camera-text-recognition|react-native-barcode-builder|react-native-nfc-manager|react-native-fast-image|react-native-linear-gradient|react-native-svg|react-native-vector-icons|react-native-haptic-feedback|react-native-device-info|expo-image-picker|expo-file-system|expo-secure-store|zustand|axios)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testEnvironment: 'node',
};