import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: ['221c2284dc17.ngrok-free.app'],
      },
      esbuild: {
        // Remove the custom loader configuration that forces js -> jsx
        // We have renamed files to .jsx, so we should rely on standard behavior.
        // OR update include regex to match .jsx
        loader: "jsx",
        include: /src\/.*\.[jt]sx?$/,
        exclude: [],
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      }
    };
});
