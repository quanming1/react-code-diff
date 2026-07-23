import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'refractor/jsx': resolve(__dirname, 'node_modules/refractor/lang/jsx.js'),
      'refractor/tsx': resolve(__dirname, 'node_modules/refractor/lang/tsx.js'),
    },
  },
})
