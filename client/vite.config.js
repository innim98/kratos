import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const clientPort = parseInt(env.CLIENT_PORT || '15000', 10);
  const serverPort = parseInt(env.PORT || '15001', 10);

  return {
    plugins: [react()],
    optimizeDeps: {
      include: [
        'react', 'react-dom', 'react/jsx-runtime',
        '@xterm/xterm', '@xterm/addon-fit',
        'lucide-react',
        '@radix-ui/react-dialog', '@radix-ui/react-slot',
        'class-variance-authority', 'clsx', 'tailwind-merge',
      ],
    },
    server: {
      port: clientPort,
      proxy: {
        '/api': `http://localhost:${serverPort}`,
        '/shared': `http://localhost:${serverPort}`,
        '/ws': {
          target: `ws://localhost:${serverPort}`,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', () => {});
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              socket.on('error', () => {});
            });
          },
        },
      },
    },
  };
});
