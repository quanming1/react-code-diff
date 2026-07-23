import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'refractor/jsx': resolve(__dirname, 'node_modules/refractor/lang/jsx.js'),
      'refractor/tsx': resolve(__dirname, 'node_modules/refractor/lang/tsx.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
