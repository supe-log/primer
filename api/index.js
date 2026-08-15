/**
 * Vercel looks at this file as the function. The Express app is the esbuild
 * bundle produced by `npm run build:vercel`, so Node never has to load .ts.
 */
export { default } from "../dist/function.js";

export const config = { maxDuration: 300 };
