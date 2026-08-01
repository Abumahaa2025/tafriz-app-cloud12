import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Keep identity/branding in public/manifest.webmanifest + index.html only.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
