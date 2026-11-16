import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import adminAuthRouter from './routes/adminAuth.js';
import catalogueRouter from './routes/catalogue.js';
import inventoryAdminRouter from './routes/adminInventory.js';

const app = express();

app.disable('x-powered-by');
if (env.trustProxyHops > 0) app.set('trust proxy', env.trustProxyHops);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => console.info(`${req.method} ${res.statusCode} ${Date.now() - started}ms`));
  next();
});

app.use('/api/v1', healthRouter);
app.use('/api/v1', authRouter);
app.use('/api/v1', adminAuthRouter);
app.use('/api/v1', inventoryAdminRouter);
app.use('/api/v1', catalogueRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
