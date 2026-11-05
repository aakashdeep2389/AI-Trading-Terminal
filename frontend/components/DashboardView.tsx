'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Analysis, Alert } from '../lib/schemas';
import { analysisSchema, alertSchema } from '../lib/schemas';

type DashboardSymbol = 'BTCUSDT' | 'XAUUSD';

interface Tick {
  symbol: string;
  price: number;
  timestamp: string;
  volume?: number;
}

interface JournalTrade {
  id: number;
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  outcome: string | null;
  strategy_tag: string | null;
  trade_date: string;
}

interface PaperPosition {
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  current_price: number;
  pnl: number;
  pnl_pct: number;
}

interface PaperStatus {
  is_running: boolean;
  daily_trades_today: number;
  max_daily_trades: number;
  open_positions: PaperPosition[];
}

interface InstrumentSnapshot {
  symbol: DashboardSymbol;
  analysis: Analysis | null;
  tick: Tick | null;
  error: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const symbols: DashboardSymbol[] = ['BTCUSDT', 'XAUUSD'];

function formatNumber(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function formatUpdated(value: string | null) {
  if (!value) return 'Waiting for market data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Updated recently' : `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function directionLabel(direction?: string) {
  if (direction === 'long') return 'BUY';
  if (direction === 'short') return 'SELL';
  return 'NEUTRAL';
}

export default function DashboardView({ onOpenTerminal }: { onOpenTerminal: (symbol: string) => void }) {
  const [snapshots, setSnapshots] = useState<InstrumentSnapshot[]>(() => symbols.map((symbol) => ({ symbol, analysis: null, tick: null, error: null })));
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [paperStatus, setPaperStatus] = useState<PaperStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const instrumentResults = await Promise.all(symbols.map(async (symbol): Promise<InstrumentSnapshot> => {
        try {
          const [analysisResponse, tickResponse] = await Promise.all([
            fetch(`${API}/api/analysis/${symbol}?timeframe=1h`),
            fetch(`${API}/api/market/tick/${symbol}`),
          ]);
          if (!analysisResponse.ok || !tickResponse.ok) throw new Error(`${symbol} market data unavailable`);
          const analysisResult = analysisSchema.safeParse(await analysisResponse.json());
          const tickBody = await tickResponse.json();
          if (!analysisResult.success || typeof tickBody?.price !== 'number') throw new Error(`${symbol} market payload invalid`);
          return { symbol, analysis: analysisResult.data, tick: tickBody as Tick, error: null };
        } catch (instrumentError) {
          return { symbol, analysis: null, tick: null, error: instrumentError instanceof Error ? instrumentError.message : 'Market data unavailable' };
        }
      }));

      const [alertsResponse, tradesResponse, paperResponse] = await Promise.all([
        fetch(`${API}/api/alerts`),
        fetch(`${API}/api/journal/trades?limit=5`),
        fetch(`${API}/api/paper/status`),
      ]);

      const nextAlerts: Alert[] = [];
      if (alertsResponse.ok) {
        const alertBody: unknown = await alertsResponse.json();
        if (Array.isArray(alertBody)) {
          nextAlerts.push(...alertBody.map((item) => alertSchema.safeParse(item)).filter((result): result is { success: true; data: Alert } => result.success).map((result) => result.data));
        }
      }
      const tradeBody = tradesResponse.ok ? await tradesResponse.json() : null;
      const nextTrades = Array.isArray(tradeBody?.trades) ? tradeBody.trades as JournalTrade[] : [];
      const nextPaperStatus = paperResponse.ok ? await paperResponse.json() as PaperStatus : null;

      setSnapshots(instrumentResults);
      setAlerts(nextAlerts);
      setTrades(nextTrades);
      setPaperStatus(nextPaperStatus);
      setUpdatedAt(new Date().toISOString());
      if (instrumentResults.every((snapshot) => snapshot.error)) setError('Market data is currently unavailable.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Dashboard data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const refreshTimer = window.setInterval(loadDashboard, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadDashboard]);

  const btc = snapshots.find((snapshot) => snapshot.symbol === 'BTCUSDT');
  const xau = snapshots.find((snapshot) => snapshot.symbol === 'XAUUSD');
  const signalSnapshot = snapshots.find((snapshot) => snapshot.analysis?.risk?.direction && snapshot.analysis.risk.direction !== 'none');
  const signalRisk = signalSnapshot?.analysis?.risk;
  const activeAlerts = alerts.filter((alert) => alert.enabled);
  const latestPosition = paperStatus?.open_positions?.[0];

  return (
    <section className="dashboard-view" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">MARKET INTELLIGENCE / OVERVIEW</div>
          <h2 id="dashboard-title">Good morning, operator.</h2>
          <p>Live market context, deterministic signals and execution readiness in one view.</p>
        </div>
        <div className="dashboard-refresh-state">
          <span className="status-dot online" aria-hidden="true" />
          <span>{formatUpdated(updatedAt)}</span>
          <button type="button" className="dashboard-refresh-button" onClick={loadDashboard} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="dashboard-error" role="status"><span>!</span>{error}</div>}

      <div className="dashboard-market-grid">
        {[btc, xau].map((snapshot) => {
          const analysis = snapshot?.analysis;
          const indicators = analysis?.indicators;
          const change = indicators?.change24h_pct;
          const isPositive = typeof change === 'number' && change >= 0;
          return (
            <article className="dashboard-market-card" key={snapshot?.symbol}>
              <div className="dashboard-card-topline"><span className="instrument-symbol">{snapshot?.symbol || '—'}</span><span className="market-status"><span className="status-dot online" aria-hidden="true" />LIVE</span></div>
              <div className="market-price">{formatNumber(snapshot?.tick?.price ?? analysis?.price, snapshot?.symbol === 'BTCUSDT' ? 2 : 2)}</div>
              <div className={`market-change ${isPositive ? 'positive' : 'negative'}`}>{typeof change === 'number' ? `${isPositive ? '+' : ''}${change.toFixed(2)}%` : 'Change unavailable'} <span>24H</span></div>
              <div className="market-card-divider" />
              <div className="market-card-metrics">
                <div><span>Trend</span><strong className={`trend-${indicators?.trend || 'neutral'}`}>{indicators?.trend || 'Unavailable'}</strong></div>
                <div><span>ATR (14)</span><strong>{formatNumber(indicators?.atr14)}</strong></div>
                <div><span>Volume</span><strong>{snapshot?.tick?.volume ? formatNumber(snapshot.tick.volume, 0) : 'Unavailable'}</strong></div>
              </div>
              <button type="button" className="dashboard-card-link" onClick={() => snapshot?.symbol && onOpenTerminal(snapshot.symbol)}>Open terminal <span>→</span></button>
              {snapshot?.error && <div className="dashboard-inline-error">{snapshot.error}</div>}
            </article>
          );
        })}
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel analytics-panel">
          <div className="dashboard-panel-header"><div><span className="section-eyebrow">ANALYTICS</span><h3>Market analytics</h3></div><span className="panel-live-label">BACKEND COMPUTED</span></div>
          <div className="analytics-symbol-grid">
            {snapshots.map((snapshot) => {
              const indicators = snapshot.analysis?.indicators;
              const risk = snapshot.analysis?.risk;
              return <div className="analytics-symbol-block" key={snapshot.symbol}><div className="analytics-symbol-heading"><strong>{snapshot.symbol}</strong><span className={`trend-chip trend-${indicators?.trend || 'neutral'}`}>{indicators?.trend || 'Unavailable'}</span></div><div className="analytics-rows"><div><span>RSI (14)</span><strong>{formatNumber(indicators?.rsi14)}</strong></div><div><span>EMA 20</span><strong>{formatNumber(indicators?.ema20)}</strong></div><div><span>EMA 50</span><strong>{formatNumber(indicators?.ema50)}</strong></div><div><span>EMA 200</span><strong>{formatNumber(indicators?.ema200)}</strong></div><div><span>ATR (14)</span><strong>{formatNumber(indicators?.atr14)}</strong></div><div><span>Signal risk</span><strong>{risk?.risk_pct !== undefined ? `${risk.risk_pct.toFixed(2)}%` : 'Unavailable'}</strong></div></div><div className="analytics-note">Bollinger status is unavailable from the current analysis contract.</div></div>;
            })}
          </div>
        </section>

        <section className="dashboard-panel signal-panel">
          <div className="dashboard-panel-header"><div><span className="section-eyebrow">SIGNALS</span><h3>Active trading signal</h3></div><span className="panel-live-label">1H ANALYSIS</span></div>
          {signalSnapshot && signalRisk ? <div className="signal-content"><div className="signal-summary"><div><strong>{signalSnapshot.symbol}</strong><span>Deterministic risk pipeline</span></div><span className={`signal-direction ${signalRisk.direction === 'long' ? 'positive' : 'negative'}`}>{directionLabel(signalRisk.direction)}</span></div><div className="signal-levels"><div><span>Entry</span><strong>{formatNumber(signalRisk.entry)}</strong></div><div><span>Stop loss</span><strong className="negative">{formatNumber(signalRisk.stop_loss)}</strong></div><div><span>Target</span><strong className="positive">{formatNumber(signalRisk.target)}</strong></div><div><span>Risk / reward</span><strong>{signalRisk.risk_reward !== undefined ? formatNumber(signalRisk.risk_reward) : 'Unavailable'}</strong></div></div><p className="signal-reason">{signalRisk.reason || 'No additional rationale supplied by the backend.'}</p></div> : <div className="dashboard-empty-state"><span>◌</span><strong>No directional signal</strong><p>The backend has not supplied an active buy or sell signal.</p></div>}
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-panel risk-panel"><div className="dashboard-panel-header"><div><span className="section-eyebrow">RISK</span><h3>Risk overview</h3></div><span className={`paper-status ${paperStatus?.is_running ? 'running' : ''}`}>{paperStatus?.is_running ? 'PAPER RUNNING' : 'PAPER STOPPED'}</span></div><div className="risk-metric-grid"><div><span>Open positions</span><strong>{paperStatus?.open_positions?.length ?? '—'}</strong></div><div><span>Current exposure</span><strong>{latestPosition ? `${latestPosition.symbol} ${latestPosition.direction.toUpperCase()}` : 'Unavailable'}</strong></div><div><span>Risk percentage</span><strong>{signalRisk?.risk_pct !== undefined ? `${signalRisk.risk_pct.toFixed(2)}%` : 'Unavailable'}</strong></div><div><span>Daily activity</span><strong>{paperStatus ? `${paperStatus.daily_trades_today} / ${paperStatus.max_daily_trades}` : 'Unavailable'}</strong></div></div><div className="risk-disclaimer">Risk metrics are displayed only when supplied by the configured backend engine.</div></section>
        <section className="dashboard-panel activity-panel"><div className="dashboard-panel-header"><div><span className="section-eyebrow">ACTIVITY</span><h3>Recent activity</h3></div><span className="activity-count">{activeAlerts.length} active alerts</span></div><div className="activity-list">{trades.length === 0 && activeAlerts.length === 0 ? <div className="dashboard-empty-state compact"><strong>No recent activity</strong><p>Trades and alerts will appear here when recorded by the platform.</p></div> : <>{trades.slice(0, 3).map((trade) => <div className="activity-row" key={`trade-${trade.id}`}><span className={`activity-marker ${trade.pnl !== null && trade.pnl >= 0 ? 'positive' : 'negative'}`} /><div><strong>{trade.symbol} {trade.direction.toUpperCase()}</strong><span>{trade.strategy_tag || 'Journal trade'} · {trade.outcome || 'OPEN'}</span></div><b className={trade.pnl !== null && trade.pnl >= 0 ? 'positive' : 'negative'}>{trade.pnl === null ? '—' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}`}</b></div>)}{activeAlerts.slice(0, 2).map((alert) => <div className="activity-row" key={`alert-${alert.id}`}><span className="activity-marker warning" /><div><strong>{alert.symbol} alert</strong><span>{alert.name} · {alert.direction === 'up' ? 'Above' : 'Below'} {alert.condition_value}</span></div><b className="warning">ACTIVE</b></div>)}</>}</div></section>
      </div>
    </section>
  );
}
