'use client';

import type { Analysis } from '../lib/schemas';

interface StatsTickerProps {
  analysis: Analysis | null;
}

export default function StatsTicker({ analysis }: StatsTickerProps) {
  const indicators = analysis?.indicators || {};
  const risk = analysis?.risk || {};
  const rsi = indicators.rsi14;
  const price = analysis?.price ? Number(analysis.price).toFixed(2) : '—';
  const atr = indicators.atr14 ? indicators.atr14.toFixed(2) : '—';
  const trend = indicators.trend || '—';
  const verdict = risk.verdict || '—';

  // RSI status
  const rsiStatus =
    rsi !== undefined && rsi !== null
      ? rsi >= 70
        ? 'overbought'
        : rsi <= 30
        ? 'oversold'
        : 'neutral'
      : 'neutral';

  return (
    <div className="stats-ticker-grid">
      <div className="stats-metric-card">
        <div className="metric-header">
          <span className="metric-label">Market Price</span>
          <span className="metric-tag live">LIVE</span>
        </div>
        <div className="metric-value price-val">{price}</div>
      </div>

      <div className="stats-metric-card">
        <div className="metric-header">
          <span className="metric-label">RSI (14)</span>
          {rsi !== undefined && rsi !== null && (
            <span className={`metric-tag ${rsiStatus}`}>
              {rsiStatus.toUpperCase()}
            </span>
          )}
        </div>
        <div className="metric-value">
          {rsi ? rsi.toFixed(2) : '—'}
        </div>
        {rsi !== undefined && rsi !== null && (
          <div className="rsi-meter-track">
            <div
              className={`rsi-meter-fill ${rsiStatus}`}
              style={{ width: `${Math.min(Math.max(rsi, 0), 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="stats-metric-card">
        <div className="metric-header">
          <span className="metric-label">Volatility ATR</span>
          <span className="metric-tag info">14-PERIOD</span>
        </div>
        <div className="metric-value">{atr}</div>
      </div>

      <div className="stats-metric-card">
        <div className="metric-header">
          <span className="metric-label">Market Trend</span>
          <span className={`metric-tag ${trend.toLowerCase().includes('bull') ? 'pass' : trend.toLowerCase().includes('bear') ? 'reject' : 'neutral'}`}>
            {trend.toLowerCase().includes('bull') ? 'BULLISH' : trend.toLowerCase().includes('bear') ? 'BEARISH' : 'NEUTRAL'}
          </span>
        </div>
        <div className="metric-value trend-val">{trend}</div>
      </div>

      <div className="stats-metric-card">
        <div className="metric-header">
          <span className="metric-label">AI Signal Verdict</span>
          <span className={`metric-tag ${verdict.toLowerCase() === 'pass' ? 'pass' : verdict.toLowerCase() === 'reject' ? 'reject' : 'neutral'}`}>
            {verdict.toUpperCase()}
          </span>
        </div>
        <div className="metric-value signal-val">
          {risk.direction ? `${risk.direction.toUpperCase()}` : '—'}
        </div>
      </div>
    </div>
  );
}
