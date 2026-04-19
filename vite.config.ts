import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function gdriveHtmlProxy(): Plugin {
  return {
    name: "gdrive-html-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/gdrive-html")) {
          next();
          return;
        }
        const url = new URL(req.url, "http://localhost");
        const fileId = url.searchParams.get("fileId");
        if (!fileId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Missing fileId query parameter.");
          return;
        }
        try {
          const upstream = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
          const r = await fetch(upstream, { redirect: "follow" });
          const body = await r.text();
          res.statusCode = r.ok ? 200 : 502;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(body);
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(err instanceof Error ? err.message : "Proxy error");
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gdriveHtmlProxy()],
  server: {
    proxy: {
      "/gutenberg-proxy": {
        target: "https://www.gutenberg.org",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/gutenberg-proxy/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "page-flip": path.resolve(
        __dirname,
        "node_modules/page-flip/dist/js/page-flip.module.js",
      ),
    },
  },
});
