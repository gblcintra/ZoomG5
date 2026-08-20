import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // evita CORS e mantém a chave fora do browser em dev
      "/api/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/anthropic/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (req) => {
            req.setHeader("x-api-key", process.env.ANTHROPIC_API_KEY ?? "");
            req.setHeader("anthropic-version", "2023-06-01");
          });
        },
      },
    },
  },
});
