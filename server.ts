import express from "express";
import path from "node:path";
import { createApi } from "./server/app";

const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === "production";

async function main() {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", createApi());

  if (isProd) {
    // dist/server.cjs sits next to dist/public
    const publicDir = path.resolve(__dirname, "public");
    app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`SportsPredicta ${isProd ? "production" : "dev"} server on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
