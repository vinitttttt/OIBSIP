import { Router } from 'express';
import { getDatabaseStatus } from '../config/database.js';

const router = Router();

router.get('/health', (_req, res) => {
  const database = getDatabaseStatus();
  const healthy = database.status === 'connected';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', api: 'ok', database, timestamp: new Date().toISOString() });
});

router.get('/health/live', (_req, res) => res.json({ status: 'ok' }));

export default router;
