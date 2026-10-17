const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function getMarketStatus() {
  const res = await fetch(`${API}/api/market/status`);
  if (!res.ok) throw new Error('Failed to fetch market status');
  return res.json();
}
