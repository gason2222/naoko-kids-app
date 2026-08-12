import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages のサブディレクトリにデプロイするため base を設定
  base: process.env.NODE_ENV === 'production' ? '/naoko-kids-app/app-tsunagu/' : '/',
})
