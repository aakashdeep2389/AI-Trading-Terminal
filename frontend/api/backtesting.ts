const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function runBacktest(payload: any) {
  const res = await fetch(`${API}/api/backtests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to run backtest');
  return res.json();
}
