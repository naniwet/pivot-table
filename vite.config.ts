/**
 * Vite 配置 — 仅用于 demo dev server。
 *
 * 单元测试用 [vitest.config.ts](vitest.config.ts),独立配置(jsdom 环境矩阵)。
 *
 * 启动:`npm run dev`(并行启 vite + proxy/server.js),浏览器开 http://localhost:5173
 *
 * 反代架构:
 *   浏览器 ──▶ vite(5173) ──▶ Express proxy(3100) ──▶ 各 Smartbi 后端
 *
 *   - /api/configs   → Express,管理 Smartbi 配置(增删改查)
 *   - /api/health    → Express,健康检查
 *   - /proxy/:id/*   → Express,按 configId 反代到对应 Smartbi(token 自动注入)
 *
 * 前端调 Smartbi 时 baseUrl = `/proxy/<currentConfigId>`,
 * 组件内部 fetch `${baseUrl}/api/augmentedDataSet/...` 自然落到代理上。
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  // proxy/server.js 默认监听 127.0.0.1:3100,如需改端口同时改 PROXY_PORT 环境变量
  const proxyTarget = `http://127.0.0.1:${process.env.PROXY_PORT ?? 3100}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // 配置 CRUD + 健康检查
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        // Smartbi 反代
        '/proxy': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'demo-dist',
    },
  };
});
