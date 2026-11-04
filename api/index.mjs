// Vercel Node.js serverless entry point.
// All /api/* requests are rewritten here (see vercel.json) and handled by Express.
import app from '../server/index.mjs';

export const config = {
  // The color catalog is loaded through readFileSync, which Vercel's tracer cannot detect.
  includeFiles: ['data/colors.json'],
  maxDuration: 30,
};

export default app;
