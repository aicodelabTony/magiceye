import { defineConfig } from '@apps-in-toss/web-framework/config'

export default defineConfig({
  appName: 'magiceye',
  brand: {
    displayName: '매직아이',
    primaryColor: '#2F80FF',
    icon: 'https://static.toss.im/appsintoss/0000/granite.png',
  },
  permissions: [],
  outdir: 'dist',
  web: {
    host: '127.0.0.1',
    port: 5173,
    commands: {
      dev: 'npm run dev:web',
      build: 'npm run build:web',
    },
  },
  webViewProps: {
    type: 'partner',
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
  },
})
