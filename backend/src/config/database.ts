import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDatabase(): Promise<void> {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      await mongoose.connect(env.MONGO_URI, {
        // Mongoose 8 defaults are sensible; override only what we need
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000,
      });

      logger.info({ uri: env.MONGO_URI.replace(/\/\/.*@/, '//***@') }, 'Connected to MongoDB');

      mongoose.connection.on('error', (err) => {
        logger.error({ err }, 'MongoDB connection error');
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      return;
    } catch (err) {
      retries++;
      logger.warn(
        { err, attempt: retries, maxRetries: MAX_RETRIES },
        'Failed to connect to MongoDB, retrying...'
      );

      if (retries >= MAX_RETRIES) {
        logger.fatal({ err }, 'Failed to connect to MongoDB after max retries');
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

/**
 * Check if the database connection is alive. Used by /readyz endpoint.
 */
export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
