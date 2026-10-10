'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Trade {
  signal_index: number;
  entry_index: number;
  exit_index: number;
  side: 'long' | 'short';
  entry: number;
  stop_loss: number;
  target: number;
  exit: number;
  exit_reason: string;
  pnl: number;
  return_pct: number;
}

export interface BacktestStats {
  total_return: number;
  win_rate: number;
  profit_factor: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  average_trade: number;
  trade_count: number;
  trades: Trade[];
}

export interface StrategyConfig {
  name: string;
  fast: number;
  slow: number;
  risk_pct: number;
  stop_atr_multiple: number;
  rsi_buy_below: number | null;
  price_above_ema: number | null;
}

const PRESETS: Array<{ label: string; config: StrategyConfig }> = [
  {
    label: 'EMA 20/50 Crossover',
    config: {
      name: 'EMA 20/50 Crossover',
      fast: 20,
      slow: 50,
      risk_pct: 1.0,
      stop_atr_multiple: 2.0,
      rsi_buy_below: null,
      price_above_ema: null,
    },
  },
  {
    label: 'RSI Filtered Trend',
    config: {
      name: 'RSI Filtered Trend',
      fast: 20,
      slow: 50,
      risk_pct: 1.0,
      stop_atr_multiple: 2.0,
      rsi_buy_below: 35,
      price_above_ema: 200,
    },
  },
  {
    label: 'Fast Scalp (9/21)',
    config: {
      name: 'Fast Scalp (9/21)',
      fast: 9,
      slow: 21,
      risk_pct: 1.5,
      stop_atr_multiple: 1.5,
      rsi_buy_below: null,
      price_above_ema: null,
    },
  },
  {
    label: 'Golden Cross (50/200)',
    config: {
      name: 'Golden Cross (50/200)',
      fast: 50,
      slow: 200,
      risk_pct: 1.0,
      stop_atr_multiple: 3.0,
      rsi_buy_below: null,
      price_above_ema: null,
    },
  },
];

interface StrategiesViewProps {
  symbol: string;
  timeframe: string;
}

export default function StrategiesView({ symbol, timeframe }: StrategiesViewProps) {
  const [strategy, setStrategy] = useState<StrategyConfig>(PRESETS[0].config);
  const [nlPrompt, setNlPrompt] = useState('buy when RSI < 30 and price is above EMA 200, use a 2 ATR stop');
  const [parsing, setParsing] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [result, setResult] = useState<BacktestStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePresetSelect = (preset: typeof PRESETS[0]) => {
    setStrategy(preset.config);
    setErrorMsg(null);
  };

  const handleParsePrompt = async () => {
    if (!nlPrompt.trim()) return;
    setParsing(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API}/api/strategies/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nlPrompt, name: strategy.name || 'AI Generated' }),
      });
      if (!res.ok) throw new Error(`Parse failed: ${res.statusText}`);
      const data = await res.json();
      setStrategy({
        name: data.name || 'Natural Language Strategy',
        fast: data.fast ?? 20,
        slow: data.slow ?? 50,
        risk_pct: data.risk_pct ?? 1.0,
        stop_atr_multiple: data.stop_atr_multiple ?? 2.0,
        rsi_buy_below: data.rsi_buy_below ?? null,
        price_above_ema: data.price_above_ema ?? null,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse natural language intent');
    } finally {
      setParsing(false);
    }
  };

  const handleRunBacktest = async () => {
    setBacktesting(true);
    setErrorMsg(null);
    try {
      const payload = {
        symbol,
        timeframe,
        strategy: {
          name: strategy.name,
          fast: Number(strategy.fast),
          slow: Number(strategy.slow),
          risk_pct: Number(strategy.risk_pct),
          stop_atr_multiple: Number(strategy.stop_atr_multiple),
          ...(strategy.rsi_buy_below !== null ? { rsi_buy_below: Number(strategy.rsi_buy_below) } : {}),
          ...(strategy.price_above_ema !== null ? { price_above_ema: Number(strategy.price_above_ema) } : {}),
        },
      };
      const res = await fetch(`${API}/api/backtests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `Backtest error (${res.status})`);
      }
      const data = await res.json();
      setResult(data.result);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Backtest execution failed');
    } finally {
      setBacktesting(false);
    }
  };

  return (
    <div className="strategies-container">
      {/* AI Strategy Intent Bar */}
      <section className="strategy-intent-bar panel">
        <div className="intent-header">
          <span className="intent-badge">AI BUILDER</span>
          <span className="intent-title">Natural Language Strategy Generator</span>
        </div>
        <div className="intent-input-group">
          <input
            type="text"
            className="intent-input"
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            placeholder="e.g. buy when RSI < 30 and price is above EMA 200, use a 2 ATR stop"
          />
          <button
            type="button"
            className="intent-btn"
            onClick={handleParsePrompt}
            disabled={parsing}
          >
            {parsing ? 'Parsing…' : 'Parse Strategy'}
          </button>
        </div>
      </section>

      {/* Preset Quick Picks */}
      <div className="presets-bar">
        <span className="presets-label">Presets:</span>
        <div className="pills">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={strategy.name === p.config.name ? 'active' : ''}
              onClick={() => handlePresetSelect(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="strategy-error-banner">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Grid: Parameters + Results */}
      <div className="strategy-grid">
        {/* Left: Configuration Form */}
        <div className="panel strategy-config-panel">
          <div className="title">Strategy Parameters</div>

          <div className="form-group">
            <label>Strategy Name</label>
            <input
              type="text"
              value={strategy.name}
              onChange={(e) => setStrategy({ ...strategy, name: e.target.value })}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Fast EMA Period</label>
              <input
                type="number"
                min="2"
                max="200"
                value={strategy.fast}
                onChange={(e) => setStrategy({ ...strategy, fast: parseInt(e.target.value) || 20 })}
              />
            </div>
            <div className="form-group">
              <label>Slow EMA Period</label>
              <input
                type="number"
                min="3"
                max="400"
                value={strategy.slow}
                onChange={(e) => setStrategy({ ...strategy, slow: parseInt(e.target.value) || 50 })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Risk Per Trade (%)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5"
                value={strategy.risk_pct}
                onChange={(e) => setStrategy({ ...strategy, risk_pct: parseFloat(e.target.value) || 1.0 })}
              />
            </div>
            <div className="form-group">
              <label>Stop Loss (ATR Multiple)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="10"
                value={strategy.stop_atr_multiple}
                onChange={(e) => setStrategy({ ...strategy, stop_atr_multiple: parseFloat(e.target.value) || 2.0 })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>RSI Filter (Buy Below)</label>
              <input
                type="number"
                placeholder="Optional (e.g. 35)"
                value={strategy.rsi_buy_below ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setStrategy({ ...strategy, rsi_buy_below: val ? parseFloat(val) : null });
                }}
              />
            </div>
            <div className="form-group">
              <label>Trend Filter (Price Above EMA)</label>
              <input
                type="number"
                placeholder="Optional (e.g. 200)"
                value={strategy.price_above_ema ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setStrategy({ ...strategy, price_above_ema: val ? parseInt(val) : null });
                }}
              />
            </div>
          </div>

          <div className="strategy-run-actions">
            <button
              type="button"
              className="run-backtest-btn"
              onClick={handleRunBacktest}
              disabled={backtesting}
            >
              {backtesting ? 'Running Backtest…' : `Run Backtest on ${symbol} (${timeframe})`}
            </button>
          </div>
        </div>

        {/* Right: Results / Output */}
        <div className="panel strategy-results-panel">
          <div className="title">Backtest Performance ({symbol} • {timeframe})</div>

          {result ? (
            <>
              <div className="strategy-stats-grid">
                <div className="stat-box">
                  <small>Total Return</small>
                  <strong className={result.total_return >= 0 ? 'text-positive' : 'text-negative'}>
                    {result.total_return >= 0 ? '+' : ''}{result.total_return.toFixed(2)}%
                  </strong>
                </div>
                <div className="stat-box">
                  <small>Win Rate</small>
                  <strong>{result.win_rate.toFixed(1)}%</strong>
                </div>
                <div className="stat-box">
                  <small>Profit Factor</small>
                  <strong>{result.profit_factor.toFixed(2)}</strong>
                </div>
                <div className="stat-box">
                  <small>Max Drawdown</small>
                  <strong className="text-negative">-{result.max_drawdown.toFixed(2)}%</strong>
                </div>
                <div className="stat-box">
                  <small>Sharpe Ratio</small>
                  <strong>{result.sharpe.toFixed(2)}</strong>
                </div>
                <div className="stat-box">
                  <small>Total Trades</small>
                  <strong>{result.trade_count}</strong>
                </div>
              </div>

              {/* Trades List */}
              <div className="trades-table-container">
                <div className="trades-header">Recent Executed Trades</div>
                {result.trades.length === 0 ? (
                  <p className="muted">No trades triggered during backtest window.</p>
                ) : (
                  <table className="trades-table">
                    <thead>
                      <tr>
                        <th>Side</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>Reason</th>
                        <th>Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice(-8).reverse().map((trade, idx) => (
                        <tr key={idx}>
                          <td>
                            <span className={`trade-badge ${trade.side}`}>
                              {trade.side.toUpperCase()}
                            </span>
                          </td>
                          <td>{trade.entry.toFixed(2)}</td>
                          <td>{trade.exit.toFixed(2)}</td>
                          <td>
                            <span className="reason-label">
                              {trade.exit_reason.replace('_', ' ')}
                            </span>
                          </td>
                          <td className={trade.return_pct >= 0 ? 'text-positive' : 'text-negative'}>
                            {trade.return_pct >= 0 ? '+' : ''}{trade.return_pct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="empty-backtest-placeholder">
              <span className="placeholder-icon">⚡</span>
              <p>Configure strategy parameters on the left and click <b>Run Backtest</b> to evaluate historical performance.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
