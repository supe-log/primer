import { createPrimerApp } from "./app";
import { log } from "./log";

(async () => {
  const serveClient = process.env.NODE_ENV === "production" && !process.env.VERCEL;
  const { app, httpServer } = await createPrimerApp({ serveClient });

  if (process.env.VERCEL) {
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "127.0.0.1";
  // reusePort + 0.0.0.0 is ENOTSUP on some Darwin/Node builds. Bind IPv4 loopback
  // unless HOST is set, so `npm run dev` starts on a judge laptop.
  httpServer.listen({ port, host }, () => {
    log(`serving on ${host}:${port}`);
  });
})();
