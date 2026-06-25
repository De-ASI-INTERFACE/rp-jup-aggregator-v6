/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * rp-jup-aggregator-v6 — Entry point. App logic lives in app.ts.
 */
import { createApp } from './app';

const app = createApp();
const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`rp-jup-aggregator-v6 API running on port ${PORT}`));
