import app from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

try {
  await connectDatabase(env.mongoUri);
  console.info('MongoDB connected');
  app.listen(env.port, () => console.info(`PizzaHop API listening on http://localhost:${env.port}`));
} catch (error) {
  const details = { name: error.name ?? 'Error' };
  if (error.code && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) details.code = error.code;
  if (env.nodeEnv !== 'production' && typeof error.stack === 'string') details.stack = error.stack.split('\n').slice(1).join('\n');
  console.error('Unable to start PizzaHop API', details);
  process.exitCode = 1;
}
