import '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { seedAdmin } from '../services/authService.js';
import { env } from '../config/env.js';

try {
  await connectDatabase(env.mongoUri);
  const admin = await seedAdmin();
  console.info(`Admin account ready: ${admin.email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
