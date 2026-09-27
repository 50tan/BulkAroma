import './config/env'; // Must be first
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

// Routes
import searchRouter from './routes/search';
import materialsRouter, { handleGetCommonMaterials } from './routes/materials';
import compareRouter from './routes/compare';
import currenciesRouter from './routes/currencies';
import exportRouter from './routes/export';
import adminRouter from './routes/admin';
import statsRouter from './routes/stats';
import crawlRouter from './routes/crawl';
import scrapeRouter from './routes/scrape';
import cronRouter from './routes/cron';
import matchesRouter from './routes/matches';

const app = express();

// --- Security ---
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// --- CORS Configuration ---
const allowedOrigins = [
  'https://bulkaroma.com',
  'https://www.bulkaroma.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, cron, serverless rewrites)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('bulkaroma') ||
        env.nodeEnv !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
);

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path.startsWith('/health') ||
    req.path.startsWith('/api/health') ||
    req.path.startsWith('/api/cron'),
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// --- Request parsing ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Logging ---
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// --- Health Check ---
const healthHandler = (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    service: 'Bulkaroma Price Intelligence API',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// --- API Routes ---
app.use('/api/search', searchRouter);
app.use('/api/materials', materialsRouter);
app.get('/api/common-materials', handleGetCommonMaterials);
app.use('/api/compare', compareRouter);
app.use('/api/currencies', currenciesRouter);
app.use('/api/export', exportRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stats', statsRouter);
app.use('/api/crawl', crawlRouter);
app.use('/api/scrape', scrapeRouter);
app.use('/api/cron', cronRouter);
app.use('/api/matches', matchesRouter);

// --- 404 handler for API routes ---
app.use('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// --- Root or unhandled route handler (safe fallback) ---
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Bulkaroma Price Intelligence API',
    status: 'operational',
    docs: '/api/health',
  });
});

// --- Global Error Handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err.message);
  if (env.nodeEnv === 'development') {
    console.error(err.stack);
  }
  res.status(500).json({
    error: 'Internal server error',
    ...(env.nodeEnv === 'development' ? { message: err.message, stack: err.stack } : {}),
  });
});

export default app;
