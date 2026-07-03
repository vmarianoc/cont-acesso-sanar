import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.condar.sindico',
  appName: 'condar Síndico',
  webDir: 'dist',
  backgroundColor: '#edebe7',
  android: {
    allowMixedContent: false,
  },
}

export default config
