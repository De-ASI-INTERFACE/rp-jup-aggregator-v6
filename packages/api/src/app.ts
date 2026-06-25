/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * rp-jup-aggregator-v6 — Express app factory (separated from listen() for testability)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { quoteRouter } from './routes/quote';
import { swapRouter } from './routes/swap';
import { accreditationBlock } from '@rp/sdk';

export function createApp() {
  const app = express();

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-api-key'],
    }),
  );

  app.use(express.json());

  // ── RATE LIMITER ────────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Slow down.',
      uid: 'RP-DEASI-JUP-2026-0619-001',
    },
  });

  app.use(limiter);

  // ── AUTH GATE ────────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      res.status(402).json({
        error: 'Payment Required',
        message: 'Valid x-api-key header required.',
        uid: 'RP-DEASI-JUP-2026-0619-001',
        owner: 'Richard Patterson (@De-ASI-INTERFACE)',
      });
      return;
    }
    next();
  });

  // ── ROUTES ───────────────────────────────────────────────────────────────────
  app.use('/quote', quoteRouter);
  app.use('/swap', swapRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', accreditation: accreditationBlock() });
  });

  return app;
}
