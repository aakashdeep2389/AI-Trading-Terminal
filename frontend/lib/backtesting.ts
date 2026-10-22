const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function runBacktest(payload: Record<string, unknown>) {
  const res = await fetch(`${API}/api/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to run backtest');
  return res.json();
}
