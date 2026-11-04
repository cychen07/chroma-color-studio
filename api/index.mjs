// Vercel Node.js serverless entry point.
// All /api/* requests are rewritten here (see vercel.json) and handled by Express.
import app from '../server/index.mjs';

export const config = {
  // These are loaded through readFileSync, which Vercel's file tracer cannot detect.
  includeFiles: ['data/colors.json', 'public/sample.jpg'],
  maxDuration: 30,
};

export default app;
