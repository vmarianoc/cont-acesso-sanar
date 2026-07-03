import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.condar.portaria',
  appName: 'condar Portaria',
  webDir: 'dist',
  backgroundColor: '#edebe7',
  android: {
    allowMixedContent: false,
  },
}

export default config
