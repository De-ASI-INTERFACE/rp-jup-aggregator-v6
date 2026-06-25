/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * rp-jup-aggregator-v6 — HTTP 402 Payment-Gated Swap API
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { quoteRouter } from './routes/quote';
import { swapRouter } from './routes/swap';
import { accreditationBlock } from '@rp/sdk';

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
// Restrict to known frontend origins in production; fall back to all in dev.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl in dev (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true); // dev fallback
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
  }),
);

app.use(express.json());

// ── RATE LIMITER ─────────────────────────────────────────────────────────────
// Applied globally BEFORE the auth gate so even 402 responses are rate-limited.
// Authenticated clients: 60 req/min per IP; adjust via env if needed.
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,  // Return RateLimit-* headers
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

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`rp-jup-aggregator-v6 API running on port ${PORT}`));
