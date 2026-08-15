import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log } from "./log";

/**
 * Shared Express app factory. Local `npm start` and the Vercel function both
 * use this so routes stay one list. The Vercel function does not serve the
 * Vite build; the CDN does.
 */
export async function createPrimerApp(options: { serveClient?: boolean } = {}) {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api")) {
        log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
      }
    });
    next();
  });

  await registerRoutes(httpServer, app);

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : 500;
    const message =
      err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (options.serveClient) {
    serveStatic(app);
  }

  return { app, httpServer };
}
