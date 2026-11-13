import type { CapacitorConfig } from '@capacitor/cli';

// appId still carries Lovable's prefix. Changing it is a separate decision, to make before the first store release.
const config: CapacitorConfig = {
  appId: 'app.lovable.69dfeef6f12545a4854fd1eee2a30ff9',
  appName: 'EZZ BILL',
  webDir: 'dist',
  server: {
    url: 'https://ezbill.live',
  },
};

export default config;
