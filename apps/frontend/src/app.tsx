/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * rp-jup-aggregator-v6 Frontend — Richard Patterson (@De-ASI-INTERFACE)
 */
import React, { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';

export default function SwapPage() {
  const [inputMint, setInputMint] = useState('So11111111111111111111111111111111111111112');
  const [outputMint, setOutputMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [amount, setAmount] = useState('10000000');
  const [result, setResult] = useState<string>('');

  async function handleQuote() {
    const res = await fetch(`${API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`, {
      headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '' },
    });
    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
  }

  return (
    <main style={{ padding: 32, fontFamily: 'monospace' }}>
      <h1>rp-jup-aggregator-v6</h1>
      <p>RP-DEASI-JUP-2026-0619-001 | Richard Patterson (@De-ASI-INTERFACE)</p>
      <div><label>Input Mint<input value={inputMint} onChange={e => setInputMint(e.target.value)} style={{ width: 400 }} /></label></div>
      <div><label>Output Mint<input value={outputMint} onChange={e => setOutputMint(e.target.value)} style={{ width: 400 }} /></label></div>
      <div><label>Amount (lamports)<input value={amount} onChange={e => setAmount(e.target.value)} /></label></div>
      <button onClick={handleQuote}>Get Quote</button>
      <pre style={{ background: '#111', color: '#0f0', padding: 16, marginTop: 16 }}>{result}</pre>
    </main>
  );
}
