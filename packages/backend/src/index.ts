// Load .env file FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Now import everything else
import express from 'express';
import cors from 'cors';
import routes from './routes';
import { securityHeaders, sanitizeInput, rateLimit } from './middleware/securityMiddleware';
import { requestLogger, responseTimeTracker } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { config } from './config';
import { logger } from './lib/logger';

const app = express();
const PORT = config.port;

// Request tracking middleware
app.use(requestLogger);
app.use(responseTimeTracker);

// Security middleware
app.use(securityHeaders);
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInput);

// Rate limiting: 2000 requests per 5 minutes per IP
app.use(rateLimit({ windowMs: 5 * 60 * 1000, maxRequests: 2000 }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server only if not in test mode
if (config.nodeEnv !== 'test') {
  app.listen(PORT, () => {
    logger.debug(`AarogyamAI backend listening on port ${PORT}`);
    logger.debug(`Environment: ${config.nodeEnv}`);
  });
}

export default app;
