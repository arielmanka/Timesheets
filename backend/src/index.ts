import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, isDatabaseReady } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { v1Router } from './routes/v1/index.js';
import { reconcile } from './services/invoice.service.js';

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Health & readiness endpoints (TECH-20)
// ---------------------------------------------------------------------------
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/readyz', (_req, res) => {
  const dbReady = isDatabaseReady();
  if (dbReady) {
    res.status(200).json({ status: 'ready', db: 'connected' });
  } else {
    res.status(503).json({ status: 'not ready', db: 'disconnected' });
  }
});

// ---------------------------------------------------------------------------
// API routes — versioned (TECH-19)
// ---------------------------------------------------------------------------
app.use('/api/v1', v1Router);

// ---------------------------------------------------------------------------
// Internal reconciliation endpoint (not exposed via Nginx)
// ---------------------------------------------------------------------------
app.post('/internal/reconcile', async (_req, res) => {
  const result = await reconcile();
  res.json({ message: 'Reconciliation complete', ...result });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function start(): Promise<void> {
  try {
    await connectDatabase();

    // Run invoice reconciliation on startup
    try {
      const { fixed, cleaned } = await reconcile();
      if (fixed > 0 || cleaned > 0) {
        logger.info({ fixed, cleaned }, 'Startup reconciliation completed');
      }
    } catch (err) {
      logger.warn({ err }, 'Startup reconciliation failed (non-fatal)');
    }

    app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, env: env.NODE_ENV },
        `Server started on port ${env.PORT}`
      );
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { app };
