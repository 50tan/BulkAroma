import app from './app';
import { env } from './config/env';

// Only start the HTTP server if not running inside a Vercel Serverless Function
if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  app.listen(env.port, () => {
    console.log(`\n🌿 Bulkaroma Price Intelligence API`);
    console.log(`   Running on http://localhost:${env.port}`);
    console.log(`   Environment: ${env.nodeEnv}\n`);
  });
}

export default app;
