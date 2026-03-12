import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
  proxy: {
    '/api/mqtt':    { target: 'http://localhost:3001', changeOrigin: true, rewrite: path => path.replace(/^\/api\/mqtt/, '/mqtt') },
    '/api/graphql': { target: 'http://localhost:3001', changeOrigin: true, rewrite: path => path.replace(/^\/api\/graphql/, '/graphql') },
    '/api/grpc':    { target: 'http://localhost:3001', changeOrigin: true, rewrite: path => path.replace(/^\/api\/grpc/, '/grpc') },
    '/api/soap':    { target: 'http://localhost:3001', changeOrigin: true, rewrite: path => path.replace(/^\/api\/soap/, '/soap') },
  }
},
});