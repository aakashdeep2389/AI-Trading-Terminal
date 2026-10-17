const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function getPaperTradingStatus() {
  const res = await fetch(`${API}/api/paper/status`);
  if (!res.ok) throw new Error('Failed to fetch paper trading status');
  return res.json();
}

export async function startPaperEngine() {
  const res = await fetch(`${API}/api/paper/start`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start paper engine');
  return res.json();
}

export async function stopPaperEngine() {
  const res = await fetch(`${API}/api/paper/stop`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to stop paper engine');
  return res.json();
}

export async function updatePaperConfig(payload: any) {
  const res = await fetch(`${API}/api/paper/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update paper config');
  return res.json();
}
