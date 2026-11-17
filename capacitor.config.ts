import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forageahead.arpg',
  appName: 'Forage Ahead',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
