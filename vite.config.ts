import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      quoteStyle: "double",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  // VITE_* plus the two public UPI values (CAFE_UPI_ID, CAFE_PAYEE_NAME) reach the browser
  envPrefix: ["VITE_", "CAFE_UPI_ID", "CAFE_PAYEE_NAME"],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      // nodemailer is a Node.js-only package (uses node:stream, node:crypto, etc.)
      // It must never be bundled into the browser build.
      // The email.provider.ts already guards with `typeof window === "undefined"`
      // before dynamically importing it, so this is safe.
      external: ["nodemailer"],
    },
  },
});
