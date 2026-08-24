import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Vitest 多 project 配置（D1，FR1.2）：
 * - legacy：现有 src/code-diff 纯逻辑测试（node 环境，refractor alias）
 * - core：@cd/core 数据层测试（node 环境，零依赖）
 * 后续 D3/D4/D5/D6 按包追加 project（view 层如需 DOM 可单独指定 environment）。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'refractor/jsx': resolve(__dirname, 'node_modules/refractor/lang/jsx.js'),
      'refractor/tsx': resolve(__dirname, 'node_modules/refractor/lang/tsx.js'),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'legacy',
          environment: 'node',
          include: ['src/**/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['packages/core/src/**/__tests__/**/*.test.ts'],
        },
      },
    ],
  },
})
