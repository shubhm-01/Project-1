import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shadowescape.lastsurvivor',
  appName: 'Shadow Escape: The Last Survivor',
  webDir: 'dist',
  backgroundColor: '#05060d',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#05060d',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
