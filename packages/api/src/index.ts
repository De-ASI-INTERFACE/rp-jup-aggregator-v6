/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * rp-jup-aggregator-v6 — HTTP 402 Payment-Gated Swap API
 * SECURITY: rate limiting + CORS origin whitelist — audit fix 2026-08-09
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { quoteRouter } from './routes/quote';
import { swapRouter } from './routes/swap';
import { accreditationBlock } from '@rp/sdk';

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }),
);
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', uid: 'RP-DEASI-JUP-2026-0619-001' },
});
app.use(limiter);

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

app.use('/quote', quoteRouter);
app.use('/swap', swapRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', accreditation: accreditationBlock() });
});

const PORT = process.env.PORT || 4002;
if (require.main === module) {
  app.listen(PORT, () => console.log(`rp-jup-aggregator-v6 API running on port ${PORT}`));
}

export default app;
