'use client';

import type { Analysis } from '../lib/schemas';

interface AnalysisPanelProps {
  symbol: string;
  timeframe: string;
  analysis: Analysis | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function AnalysisPanel({
  symbol,
  timeframe,
  analysis,
  loading,
  onRefresh,
}: AnalysisPanelProps) {
  const indicators = analysis?.indicators || {};
  const risk = analysis?.risk || {};
  const patterns = analysis?.patterns || [];

  return (
    <div className="panel analysis-panel-wrapper">
      <div className="panel-header-row">
        <div className="panel-title-with-badge">
          <span className="panel-badge ai">AI ENGINE</span>
          <h2 className="panel-title">Deterministic Analysis</h2>
        </div>
        <button
          type="button"
          className="panel-action-btn"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Analyzing…' : '↻ Run Pipeline'}
        </button>
      </div>

      {analysis ? (
        <div className="analysis-content">
          {/* Signal Header Card */}
          <div className="analysis-signal-banner">
            <div className="signal-meta">
              <span className="symbol-timeframe-tag">
                {symbol} • {timeframe}
              </span>
              <div className={`verdict-badge ${risk.verdict || 'neutral'}`}>
                {risk.verdict ? risk.verdict.toUpperCase() : 'PENDING'}
              </div>
            </div>
            <div className="signal-direction-text">
              Recommended: <strong>{risk.direction ? risk.direction.toUpperCase() : 'NEUTRAL'}</strong>
            </div>
          </div>

          {/* Trade Execution Levels */}
          <div className="execution-levels-grid">
            <div className="level-item entry">
              <span className="level-label">Suggested Entry</span>
              <span className="level-value">
                {risk.entry !== undefined && risk.entry !== null ? Number(risk.entry).toFixed(2) : '—'}
              </span>
            </div>
            <div className="level-item stop">
              <span className="level-label">Stop Loss</span>
              <span className="level-value text-negative">
                {risk.stop_loss !== undefined && risk.stop_loss !== null ? Number(risk.stop_loss).toFixed(2) : '—'}
              </span>
            </div>
            <div className="level-item target">
              <span className="level-label">Target Take-Profit</span>
              <span className="level-value text-positive">
                {risk.target !== undefined && risk.target !== null ? Number(risk.target).toFixed(2) : '—'}
              </span>
            </div>
          </div>

          {/* Trend & Entry Reasons */}
          <div className="analysis-notes">
            {indicators.trend_reason && (
              <div className="note-card">
                <span className="note-title">📈 Trend Architecture</span>
                <p>{indicators.trend_reason}</p>
              </div>
            )}

            {risk.reason && (
              <div className="note-card">
                <span className="note-title">🎯 Entry Rationale</span>
                <p>{risk.reason}</p>
              </div>
            )}

            {/* Pattern Recognition Pills */}
            <div className="note-card">
              <span className="note-title">🔍 Detected Candlestick Patterns</span>
              {patterns.length > 0 ? (
                <div className="pattern-tags-row">
                  {patterns.map((pattern, idx) => (
                    <span key={idx} className="pattern-pill">
                      {pattern.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted-text">No technical candlestick patterns identified on {timeframe}.</p>
              )}
            </div>
          </div>

          <div className="analysis-footer-disclaimer">
            <span>🛡️ Deterministic numerical calculations verified by backend mathematical pipeline.</span>
          </div>
        </div>
      ) : (
        <div className="analysis-empty-state">
          <div className="empty-icon">🧠</div>
          <p className="empty-title">Pipeline Idle</p>
          <p className="empty-sub">Click <b>Run Pipeline</b> or <b>Analyze</b> to evaluate technical indicators, support/resistance, and risk parameters.</p>
        </div>
      )}
    </div>
  );
}
