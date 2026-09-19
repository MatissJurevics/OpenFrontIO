import { defineConfig } from "vite";
export default defineConfig({
  server: { host: "127.0.0.1", port: 9010, strictPort: true },
  optimizeDeps: { include: ["three"] },
});
