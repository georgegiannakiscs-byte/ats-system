// Tiny status page on port 3000 while the codespace installs and builds Ulysse.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.argv[2];
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

http.createServer((_req, res) => {
  const failed = fs.existsSync(path.join(dataDir, "setup-failed"));
  let log = "";
  try { log = fs.readFileSync(path.join(dataDir, "setup.log"), "utf8"); } catch {}
  const step = (log.match(/^== (.*)$/gm) ?? []).pop()?.slice(3) ?? "Getting ready";
  const tail = log.trim().split("\n").slice(-25).join("\n");
  res.writeHead(failed ? 500 : 503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${failed ? "" : '<meta http-equiv="refresh" content="5">'}<title>Ulysse is starting…</title>
<style>body{margin:0;background:#faf8f3;color:#193329;font:16px/1.6 system-ui,sans-serif}main{max-width:640px;margin:12vh auto;padding:0 20px}
h1{font:400 34px Georgia,serif;margin:0 0 8px}.dot{color:#be7157}p{color:#5f6a64}pre{background:#fff;border:1px solid #e7e3d8;border-radius:8px;padding:12px;font-size:12px;overflow:auto;max-height:40vh}</style></head>
<body><main><h1>Ulysse<span class="dot">.</span></h1>
${failed
  ? `<p><strong>Setup didn't finish.</strong> Take a screenshot of this page and send it to your developer.</p><pre>${esc(tail)}</pre>`
  : `<p><strong>The app is starting…</strong> ${esc(step)}. The first start takes a few minutes. This page refreshes by itself and the app appears here when it's ready.</p>`}
</main></body></html>`);
}).listen(3000, "0.0.0.0");
