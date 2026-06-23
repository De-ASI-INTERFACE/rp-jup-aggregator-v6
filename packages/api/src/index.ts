/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * rp-jup-aggregator-v6 — HTTP 402 Payment-Gated Swap API
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { quoteRouter } from './routes/quote';
import { swapRouter } from './routes/swap';
import { accreditationBlock } from '@rp/sdk';

const app = express();
app.use(cors());
app.use(express.json());

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
app.listen(PORT, () => console.log(`rp-jup-aggregator-v6 API running on port ${PORT}`));
