import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * GitHub Pages project sites are served from `https://<user>.github.io/<repo>/`.
 * User/organization sites using a `<user>.github.io` repository are served from `/`.
 */
function githubPagesBase(): string {
  const explicit = process.env.VITE_BASE_PATH?.trim();
  if (explicit) {
    return explicit.endsWith("/") ? explicit : `${explicit}/`;
  }
  const repo = process.env.GITHUB_REPOSITORY?.split("/")?.[1];
  if (!repo) return "/";
  if (repo.endsWith(".github.io")) return "/";
  return `/${repo}/`;
}

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
const base = githubPagesBase();

export default defineConfig({
  base,
  plugins: [
    react(),
    gdriveHtmlProxy(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "background.avif"],
      manifest: {
        name: "Shelf & Reader",
        short_name: "Shelf",
        description: "Classic books with a page-turning reader. Save titles for offline reading.",
        theme_color: "#1a1510",
        background_color: "#0f0c09",
        display: "standalone",
        orientation: "any",
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}favicon.svg`,
            type: "image/svg+xml",
            sizes: "any",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,avif,woff2}"],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
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
