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

const app = express();
const PORT = process.env.PORT || 3001;

// Request tracking middleware
app.use(requestLogger);
app.use(responseTimeTracker);

// Security middleware
app.use(securityHeaders);
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Admin Panel Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
