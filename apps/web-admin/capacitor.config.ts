import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.condar.admin',
  appName: 'condar Admin',
  webDir: 'dist',
  backgroundColor: '#edebe7',
  android: {
    allowMixedContent: false,
  },
}

export default config
