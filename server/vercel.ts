import { createPrimerApp } from "./app";

/**
 * Vercel Function entry. Bundled to dist/function.js so the isolate does not
 * have to resolve TypeScript path aliases at runtime.
 */
const { app } = await createPrimerApp({ serveClient: false });

export default app;
