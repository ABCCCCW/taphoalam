import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const certFile = path.resolve(__dirname, "certs/dev-cert.pem");
const keyFile = path.resolve(__dirname, "certs/dev-key.pem");
const hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile);
const httpsPort = Number(process.env.HTTPS_PORT || 5174);

function lanHosts() {
  const hosts: string[] = [];
  const envHost = (process.env.PUBLIC_HOST || process.env.LAN_IP || "").trim();
  if (envHost) hosts.push(envHost.replace(/^https?:\/\//, "").split(":")[0]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      const v4 = a.family === "IPv4" || (a.family as unknown) === 4;
      if (!v4 || a.internal) continue;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(a.address)) continue;
      hosts.push(a.address);
    }
  }
  return [...new Set(hosts.filter((h) => h && h !== "localhost" && h !== "127.0.0.1"))];
}

function lanPlugin(): Plugin {
  return {
    name: "taphoa-lan",
    configureServer(server) {
      server.middlewares.use("/__lan", (_req, res) => {
        const port = Number(server.config.server.port || 5173);
        const hosts = lanHosts();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          hosts,
          protocol: "http",
          httpPort: port,
          httpsPort: hasCerts ? httpsPort : null,
          origins: hosts.map((h) => `http://${h}:${port}`),
          phoneOrigins: hasCerts ? hosts.map((h) => `https://${h}:${httpsPort}`) : [],
        }));
      });
    },
  };
}

/** HTTP :5173 cho máy tính (Cursor không tin chứng chỉ mkcert). HTTPS :5174 cho camera iPhone. */
let sidecar: ReturnType<typeof https.createServer> | null = null;

function httpsSidecar(): Plugin {
  return {
    name: "taphoa-https-sidecar",
    configureServer(server) {
      if (!hasCerts) return;
      const attach = () => {
        const s = https.createServer(
          { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) },
          server.middlewares,
        );
        s.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            console.warn(`[taphoa] HTTPS :${httpsPort} đang bận, giữ cổng cũ.`);
            return;
          }
          console.error(err);
        });
        s.listen(httpsPort, "0.0.0.0", () => {
          console.log(`[taphoa] điện thoại → https://0.0.0.0:${httpsPort}/`);
        });
        sidecar = s;
        server.httpServer?.once("close", () => {
          s.close();
          if (sidecar === s) sidecar = null;
        });
      };
      if (sidecar) {
        sidecar.close(() => {
          sidecar = null;
          attach();
        });
        return;
      }
      attach();
    },
  };
}

export default defineConfig({
  plugins: [react(), lanPlugin(), httpsSidecar()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    // Chạy trong Docker trên macOS thì sự kiện đổi file không lọt vào container,
    // phải dò định kỳ thì sửa code/tailwind.config mới tự nạp lại.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": {
        target: process.env.API_PROXY || "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
      },
      // ảnh sản phẩm do backend phục vụ từ backend/uploads/
      "/uploads": {
        target: process.env.API_PROXY || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
