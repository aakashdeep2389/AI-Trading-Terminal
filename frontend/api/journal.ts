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

export interface BacktestStats {
  total_return: number;
  win_rate: number;
  profit_factor: number | null;
  max_drawdown: number | null;
  sharpe: number | null;
  total_trades: number;
}

export async function getJournalStats(symbol?: string) {
  const params = new URLSearchParams();
  if (symbol) params.append('symbol', symbol);

  const res = await fetch(`${API}/api/journal/stats?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch journal stats');
  return res.json();
}

export async function exportJournalTrades(format: 'csv' | 'json', symbol?: string, outcome?: string): Promise<Blob> {
  const params = new URLSearchParams();
  params.append('format', format);
  if (symbol) params.append('symbol', symbol);
  if (outcome) params.append('outcome', outcome);

  const res = await fetch(`${API}/api/journal/export?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to export trades');
  return res.blob();
}

export async function importJournalTrades(file: File): Promise<{ imported_count: number; failed_count: number; failed_messages: string[] }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API}/api/journal/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to import trades');
  }
  return res.json();
}

