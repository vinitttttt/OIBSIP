import app from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

try {
  await connectDatabase(env.mongoUri);
  console.info('MongoDB connected');
  app.listen(env.port, () => console.info(`PizzaHop API listening on http://localhost:${env.port}`));
} catch (error) {
  console.error('Unable to start PizzaHop API:', error.message);
  process.exitCode = 1;
}
