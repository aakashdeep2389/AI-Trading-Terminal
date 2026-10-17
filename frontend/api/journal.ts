const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function getJournalTrades(symbol?: string, outcome?: string, limit = 100) {
  const params = new URLSearchParams();
  if (symbol) params.append('symbol', symbol);
  if (outcome) params.append('outcome', outcome);
  params.append('limit', limit.toString());

  const res = await fetch(`${API}/api/journal/trades?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch journal trades');
  return res.json();
}

export async function getJournalStats(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.append('symbol', symbol);

  const res = await fetch(`${API}/api/journal/stats?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch journal stats');
  return res.json();
}
