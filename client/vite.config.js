import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const clientPort = parseInt(env.CLIENT_PORT || '15000', 10);
  const serverPort = parseInt(env.PORT || '15001', 10);

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      proxy: {
        '/api': `http://localhost:${serverPort}`,
        '/ws': {
          target: `ws://localhost:${serverPort}`,
          ws: true,
        },
      },
    },
  };
});
