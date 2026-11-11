import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
  plugins: [
    VitePWA({
      // The manifest lives in public/; the plugin only builds and registers sw.js.
      manifest: false,
      injectRegister: false,
      registerType: "prompt",
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
