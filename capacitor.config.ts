interface SpiderCapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: 'http' | 'https';
  };
}

const config: SpiderCapacitorConfig = {
  appId: 'com.spideresports.app',
  appName: 'SPIDER ESPORTS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
