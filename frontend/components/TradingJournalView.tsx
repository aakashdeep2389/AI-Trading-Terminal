'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Trade {
  id: number;
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  position_size: number;
  stop_loss: number | null;
  take_profit: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  outcome: string | null;
  strategy_tag: string | null;
  timeframe: string | null;
  emotion: string | null;
  notes: string | null;
  screenshot_path: string | null;
  trade_date: string;
}

interface Stats {
  total_trades: number;
  win_rate: number;
  total_pnl: number;
  profit_factor: number;
  avg_rr: number;
  streak: number;
}

export default function TradingJournalView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats>({ total_trades: 0, win_rate: 0, total_pnl: 0, profit_factor: 1, avg_rr: 0, streak: 0 });
  const [loading, setLoading] = useState(true);
  const [editingTradeId, setEditingTradeId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    symbol: 'BTCUSDT', direction: 'long', entry_price: '', exit_price: '',
    position_size: '', stop_loss: '', take_profit: '', strategy_tag: '',
    timeframe: '1h', emotion: '', notes: '', trade_date: new Date().toISOString().slice(0, 16)
  });
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteContainerRef = useRef<HTMLDivElement>(null);

  const applyScreenshot = (file: File) => {
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyScreenshot(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { applyScreenshot(file); e.preventDefault(); break; }
      }
    }
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadTrades = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/journal/trades?symbol=${filterSymbol || ''}&outcome=${filterOutcome || ''}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterSymbol, filterOutcome]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/journal/stats?symbol=${filterSymbol || ''}`);
      if (res.ok) setStats(await res.json());
    } catch (e) { console.error(e); }
  }, [filterSymbol]);

  useEffect(() => { loadTrades(); loadStats(); }, [loadTrades, loadStats]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();

    // Always append required fields; skip only truly optional empty ones
    const required = ['symbol', 'direction', 'entry_price'];
    const optional = ['exit_price', 'stop_loss', 'take_profit', 'strategy_tag', 'emotion', 'notes'];

    required.forEach(k => {
      const v = formData[k as keyof typeof formData];
      if (v !== undefined && v !== null) form.append(k, String(v));
    });

    // position_size: default to 1 if blank
    form.append('position_size', formData.position_size || '1');

    // timeframe & trade_date always included
    form.append('timeframe', formData.timeframe);
    form.append('trade_date', formData.trade_date);

    optional.forEach(k => {
      const v = formData[k as keyof typeof formData];
      if (v !== '' && v !== null && v !== undefined) form.append(k, String(v));
    });

    if (screenshot) form.append('screenshot', screenshot);

    try {
      const url = editingTradeId ? `${API}/api/journal/trades/${editingTradeId}` : `${API}/api/journal/trades`;
      const method = editingTradeId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: form });
      if (res.ok) {
        setShowModal(false);
        setEditingTradeId(null);
        setFormData({ symbol: 'BTCUSDT', direction: 'long', entry_price: '', exit_price: '', position_size: '', stop_loss: '', take_profit: '', strategy_tag: '', timeframe: '1h', emotion: '', notes: '', trade_date: new Date().toISOString().slice(0, 16) });
        setScreenshot(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadTrades(); loadStats();
      } else {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        let msg = '';
        if (Array.isArray(err.detail)) {
          msg = err.detail.map((d: { loc?: string[]; msg?: string }) => `${d.loc?.join('.') || 'field'}: ${d.msg || 'invalid'}`).join('\n');
        } else if (typeof err.detail === 'string') {
          msg = err.detail;
        } else {
          msg = JSON.stringify(err);
        }
        alert(`Save failed:\n${msg}`);
      }
    } catch (e) {
      console.error(e);
      alert('Network error — is the backend running?');
    }
  };

  const handleEdit = (trade: Trade) => {
    setEditingTradeId(trade.id);
    setFormData({
      symbol: trade.symbol, direction: trade.direction,
      entry_price: String(trade.entry_price),
      exit_price: trade.exit_price ? String(trade.exit_price) : '',
      position_size: String(trade.position_size),
      stop_loss: trade.stop_loss ? String(trade.stop_loss) : '',
      take_profit: trade.take_profit ? String(trade.take_profit) : '',
      strategy_tag: trade.strategy_tag || '',
      timeframe: trade.timeframe || '1h',
      emotion: trade.emotion || '',
      notes: trade.notes || '',
      trade_date: trade.trade_date.slice(0, 16)
    });
    if (trade.screenshot_path) {
      setPreview(`${API}${trade.screenshot_path}`);
    } else {
      setPreview(null);
    }
    setScreenshot(null);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this trade?')) return;
    try {
      await fetch(`${API}/api/journal/trades/${id}`, { method: 'DELETE' });
      loadTrades(); loadStats();
    } catch (e) { console.error(e); }
  };

  const formatPrice = (v: number | null | undefined) => v ? Number(v).toFixed(2) : '-';
  const formatPnl = (v: number | null | undefined) => v ? (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : '-';

  const tradesWithScreenshots = trades.filter(t => t.screenshot_path);

  return (
    <div className="journal-view">
      {/* Header */}
      <div className="journal-header">
        <div className="journal-title">
          <h2>📝 Trading Journal</h2>
          <span className="journal-subtitle">Track, analyze, and improve your trading</span>
        </div>
        <div className="journal-actions">
          <button className="btn-secondary" onClick={() => setShowGallery(true)}>🖼️ Gallery</button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Trade</button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="stats-dashboard">
        <div className="stat-card"><span className="stat-label">Total Trades</span><span className="stat-value">{stats.total_trades}</span></div>
        <div className="stat-card"><span className="stat-label">Win Rate</span><span className="stat-value">{stats.win_rate.toFixed(1)}%</span></div>
        <div className="stat-card"><span className="stat-label">Total P&L</span><span className={`stat-value ${stats.total_pnl >= 0 ? 'positive' : 'negative'}`}>{formatPnl(stats.total_pnl)}</span></div>
        <div className="stat-card"><span className="stat-label">Profit Factor</span><span className="stat-value">{stats.profit_factor.toFixed(2)}</span></div>
        <div className="stat-card"><span className="stat-label">Avg R:R</span><span className="stat-value">{stats.avg_rr.toFixed(2)}</span></div>
        <div className="stat-card"><span className="stat-label">Best Streak</span><span className="stat-value">{stats.streak}</span></div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)}>
          <option value="">All Symbols</option>
          <option value="BTCUSDT">BTCUSDT</option>
          <option value="XAUUSD">XAUUSD</option>
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}>
          <option value="">All Outcomes</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="breakeven">Breakeven</option>
        </select>
        <span className="trade-count">{trades.length} trades</span>
      </div>

      {/* Trade Entries Table Grid */}
      {loading ? <div className="loading">Loading...</div> : (
        <div className="trades-table-wrapper">
          {trades.length === 0 ? <div className="empty-state">No trades recorded yet. Click &quot;+ Add Trade&quot; to start.</div> : (
            <table className="journal-data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Image</th>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th>Outcome</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Size</th>
                  <th>P&amp;L</th>
                  <th>R:R</th>
                  <th>Strategy</th>
                  <th>Emotion</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trades.map(trade => (
                  <tr key={trade.id} className={`trade-row ${trade.outcome || 'open'}`}>
                      <td>{new Date(trade.trade_date).toLocaleDateString()}</td>
                      <td>
                        {trade.screenshot_path ? (
                          <div className="table-thumbnail-wrap">
                            <img
                              src={`${API}${trade.screenshot_path}`}
                              alt="Screenshot"
                              className="table-thumbnail-img"
                              onClick={() => setFullScreenImage(`${API}${trade.screenshot_path}`)}
                            />
                          </div>
                        ) : (
                          <span className="no-image-dash">-</span>
                        )}
                      </td>
                      <td className="font-bold">{trade.symbol}</td>
                      <td>
                        <span className={`trade-direction ${trade.direction}`}>
                          {trade.direction.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`trade-outcome ${trade.outcome || 'open'}`}>
                          {(trade.outcome || 'OPEN').toUpperCase()}
                        </span>
                      </td>
                      <td>{formatPrice(trade.entry_price)}</td>
                      <td>{formatPrice(trade.exit_price)}</td>
                      <td>{trade.position_size}</td>
                      <td className={trade.pnl ? (trade.pnl >= 0 ? 'pnl-pos' : 'pnl-neg') : ''}>
                        {trade.pnl ? `${formatPnl(trade.pnl)} (${trade.pnl_pct?.toFixed(1)}%)` : '-'}
                      </td>
                      <td>
                        {(trade.stop_loss !== null && trade.take_profit !== null && trade.entry_price !== null && (trade.entry_price - trade.stop_loss) !== 0)
                          ? ((trade.take_profit - trade.entry_price) / (trade.entry_price - trade.stop_loss)).toFixed(2)
                          : '-'}
                      </td>
                      <td>{trade.strategy_tag ? <span className="strategy-tag">{trade.strategy_tag}</span> : '-'}</td>
                      <td>{trade.emotion ? <span className="emotion-tag">{trade.emotion}</span> : '-'}</td>
                      <td className="notes-cell" title={trade.notes || ''}>{trade.notes || '-'}</td>
                      <td>
                        <div className="table-action-btns">
                          {trade.screenshot_path && (
                            <button
                              type="button"
                              className="btn-icon"
                              title="View Screenshot in Gallery"
                              onClick={() => setShowGallery(true)}
                            >
                              🖼️
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-icon"
                            title="Edit Trade"
                            onClick={() => handleEdit(trade)}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn-icon delete"
                            title="Delete Trade"
                            onClick={() => handleDelete(trade.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      
      {/* Full-Screen Image Modal */}
      {fullScreenImage && (
        <div className="modal-overlay" onClick={() => setFullScreenImage(null)}>
          <div className="modal image-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setFullScreenImage(null)}>✕</button>
            <img src={fullScreenImage} alt="Full screen" className="full-screen-img" />
          </div>
        </div>
      )}

      {/* Add / Edit Trade Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingTradeId(null); }}>
          <div className="modal add-trade-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingTradeId ? '✏️ Edit Trade' : '+ Add Trade'}</h3><button className="close-btn" onClick={() => { setShowModal(false); setEditingTradeId(null); }}>×</button></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Symbol *</label><select value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value})} required><option value="BTCUSDT">BTCUSDT</option><option value="XAUUSD">XAUUSD</option><option value="ETHUSDT">ETHUSDT</option></select></div>
                <div className="form-group"><label>Direction *</label><select value={formData.direction} onChange={e => setFormData({...formData, direction: e.target.value})} required><option value="long">LONG</option><option value="short">SHORT</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Entry Price *</label><input type="number" step="any" value={formData.entry_price} onChange={e => setFormData({...formData, entry_price: e.target.value})} required /></div>
                <div className="form-group"><label>Exit Price</label><input type="number" step="any" value={formData.exit_price} onChange={e => setFormData({...formData, exit_price: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Position Size</label><input type="number" step="any" value={formData.position_size} onChange={e => setFormData({...formData, position_size: e.target.value})} /></div>
                <div className="form-group"><label>Timeframe</label><select value={formData.timeframe} onChange={e => setFormData({...formData, timeframe: e.target.value})}><option value="1m">1m</option><option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1d</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Stop Loss</label><input type="number" step="any" value={formData.stop_loss} onChange={e => setFormData({...formData, stop_loss: e.target.value})} /></div>
                <div className="form-group"><label>Take Profit</label><input type="number" step="any" value={formData.take_profit} onChange={e => setFormData({...formData, take_profit: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Strategy Tag</label><input type="text" placeholder="e.g., EMA Cross" value={formData.strategy_tag} onChange={e => setFormData({...formData, strategy_tag: e.target.value})} /></div>
                <div className="form-group"><label>Emotion</label><select value={formData.emotion} onChange={e => setFormData({...formData, emotion: e.target.value})}><option value="">Select...</option><option value="calm">Calm</option><option value="confident">Confident</option><option value="fomo">FOMO</option><option value="fear">Fear</option><option value="revenge">Revenge</option><option value="bored">Bored</option></select></div>
              </div>
              <div className="form-group"><label>Trade Date</label><input type="datetime-local" value={formData.trade_date} onChange={e => setFormData({...formData, trade_date: e.target.value})} /></div>
              <div className="form-group">
                <label>Screenshot</label>
                <div
                  ref={pasteContainerRef}
                  className={`screenshot-drop-zone ${preview ? 'has-image' : ''}`}
                  tabIndex={0}
                  onPaste={handlePaste}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith('image/')) applyScreenshot(f); }}
                  onDragOver={e => e.preventDefault()}
                >
                  {preview ? (
                    <div className="screenshot-preview-wrap">
                      <img src={preview} alt="Preview" className="screenshot-preview-img" />
                      <button type="button" className="screenshot-clear-btn" onClick={clearScreenshot}>✕ Remove</button>
                    </div>
                  ) : (
                    <div className="screenshot-placeholder">
                      <span className="screenshot-icon">📋</span>
                      <span className="screenshot-hint">Click here then press <kbd>Ctrl+V</kbd> to paste</span>
                      <span className="screenshot-hint-sub">or drag &amp; drop, or</span>
                      <button type="button" className="screenshot-browse-btn" onClick={() => fileInputRef.current?.click()}>Browse file</button>
                    </div>
                  )}
                </div>
                <input type="file" ref={fileInputRef} accept="image/*" className="hidden-file-input" onChange={handleFileChange} />
              </div>
              <div className="form-group"><label>Notes</label><textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={3} /></div>
              <div className="form-actions"><button type="button" className="btn-cancel" onClick={() => { setShowModal(false); setEditingTradeId(null); }}>Cancel</button><button type="submit" className="btn-submit">{editingTradeId ? 'Update Trade' : 'Save Trade'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Gallery Modal */}
      {showGallery && (
        <div className="modal-overlay" onClick={() => setShowGallery(false)}>
          <div className="modal gallery-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🖼️ Trade Screenshots ({tradesWithScreenshots.length})</h3>
              <button className="close-btn" onClick={() => setShowGallery(false)}>×</button>
            </div>
            <div className="gallery-grid">
              {tradesWithScreenshots.length === 0 ? (
                <div className="empty-state">No screenshots yet.</div>
              ) : (
                tradesWithScreenshots.map(trade => (
                  <div key={trade.id} className="gallery-item">
                    <img src={`${API}${trade.screenshot_path}`} alt={`${trade.symbol} ${trade.direction}`} />
                    <div className="gallery-caption">{trade.symbol} - {trade.direction.toUpperCase()} - {new Date(trade.trade_date).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}