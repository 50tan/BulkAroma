import './config/env'; // Must be first
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

// Routes
import searchRouter from './routes/search';
import materialsRouter from './routes/materials';
import compareRouter from './routes/compare';
import currenciesRouter from './routes/currencies';
import exportRouter from './routes/export';
import adminRouter from './routes/admin';
import statsRouter from './routes/stats';

const app = express();

// --- Security ---
app.use(helmet());
app.use(cors({
  origin: env.nodeEnv === 'production'
    ? ['https://bulkaroma.com', 'https://www.bulkaroma.com']
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// --- Rate limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// --- Request parsing ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Logging ---
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- API Routes ---
import { handleGetCommonMaterials } from './routes/materials';

app.use('/api/search', searchRouter);
app.use('/api/materials', materialsRouter);
app.get('/api/common-materials', handleGetCommonMaterials);
app.use('/api/compare', compareRouter);
app.use('/api/currencies', currenciesRouter);
app.use('/api/export', exportRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stats', statsRouter);

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Error handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  if (env.nodeEnv === 'development') {
    console.error(err.stack);
  }
  res.status(500).json({
    error: 'Internal server error',
    ...(env.nodeEnv === 'development' ? { message: err.message } : {}),
  });
});

// --- Start ---
app.listen(env.port, () => {
  console.log(`\n🌿 Bulkaroma Price Intelligence API`);
  console.log(`   Running on http://localhost:${env.port}`);
  console.log(`   Environment: ${env.nodeEnv}\n`);
});

export default app;
