import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5300,
    proxy: {
      // '^/api/'로 좁힌다. 그냥 '/api'면 SPA 라우트 /api(RS API 탐색기)까지
      // 백엔드로 넘어가 새로고침·직접접속 시 'Cannot GET /api'가 뜬다.
      '^/api/': { target: 'http://localhost:4300', changeOrigin: true },
    },
  },
});
