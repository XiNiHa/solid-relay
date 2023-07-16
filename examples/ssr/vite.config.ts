import solid from 'solid-start/vite'
import { defineConfig } from 'vite'
import relay from 'vite-plugin-relay'

export default defineConfig({
  plugins: [solid(), relay],
})
