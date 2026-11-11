import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import fs from "fs";

const SSL_KEY = process.env.SSL_KEY_PATH ?? "/root/c53097v1fyreibmcom.key";
const SSL_CERT = process.env.SSL_CERT_PATH ?? "/root/HealthCheck/Project/HealthcheckDB/Certificate_pem.crt";
const hasSSL = fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT);

export default defineConfig(({ mode }) => {
  // Expose every VITE_* value to both the browser and server bundles as a
  // compile-time constant, so server code reading import.meta.env.VITE_* sees
  // the same value as the browser.
  const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(viteEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define,
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        // Anything under a server/ folder (or importing "server-only") must
        // never be bundled into the browser.
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      viteReact(),
    ],
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      // One copy of React and React Query across the app and its libraries.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: {
      host: "::",
      port: 8080,
      // Wait for files to finish writing before reloading.
      watch: { awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } },
      ...(hasSSL && {
        https: {
          key: fs.readFileSync(SSL_KEY),
          cert: fs.readFileSync(SSL_CERT),
        },
      }),
    },
  };
});
