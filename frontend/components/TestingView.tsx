import { useState, useEffect, useCallback } from 'react';
import { StrategyConfig, DEFAULT_ADVANCED_SETTINGS, DEFAULT_MARKETPLACE_SETTINGS, IndicatorConfig } from '../config/strategy.config';
import { getJournalTrades, getJournalStats, BacktestStats } from '../api/journal';
import { getPaperTradingStatus, startPaperEngine, stopPaperEngine, updatePaperConfig } from '../api/paper';
import { runBacktest } from '../lib/backtesting';
import './TestingView.css';

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
  exit_reason?: string | null;
  strategy_tag: string | null;
  timeframe: string | null;
  emotion: string | null;
  notes: string | null;
  screenshot_path: string | null;
  trade_date: string;
}

interface PaperTradePosition {
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  current_price: number;
  pnl: number;
  pnl_pct: number;
  open_time: string;
}

interface PaperEngineStatus {
  is_running: boolean;
  daily_trades_today: number;
  max_daily_trades: number;
  active_symbol: string;
  active_timeframe: string;
  open_positions: PaperTradePosition[];
  config?: Partial<StrategyConfig>;
}

const DEFAULT_CONFIG = {
  bb_period: 20,
  bb_std: 1.4,
  risk_pct: 1.0,
  min_confluence_score: 0,
  fib_timeframe: 'daily',
  fib_lookback: 15,
  stop_buffer: 0.001
};

export default function TestingView() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [engineStatus, setEngineStatus] = useState<PaperEngineStatus | null>(null);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>({
    name: 'Bollinger Bands MTF Paper',
    fast: DEFAULT_CONFIG.bb_period,
    slow: 50,
    risk_pct: DEFAULT_CONFIG.risk_pct,
    stop_atr_multiple: 2.0,
    stop_buffer: DEFAULT_CONFIG.stop_buffer,
    custom_indicators: [
      { type: 'bollinger_bands', params: { period: DEFAULT_CONFIG.bb_period, num_std: DEFAULT_CONFIG.bb_std } },
      { type: 'fibonacci_pivots', params: { timeframe: DEFAULT_CONFIG.fib_timeframe, lookback: DEFAULT_CONFIG.fib_lookback } }
    ],
    universal_exit: { description: '', conditions: [] },
    overnight_protection: { description: '' },
    advanced_settings: DEFAULT_ADVANCED_SETTINGS,
    marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS
  });
  const [paperTrades, setPaperTrades] = useState<Trade[]>([]);
  const [journalStats, setJournalStats] = useState<BacktestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const status = await getPaperTradingStatus();
      setEngineStatus(status);
      setError(null);

      let currentSymbol = symbol;
      let currentTimeframe = timeframe;

      if (status && status.active_symbol) {
        currentSymbol = status.active_symbol;
        currentTimeframe = status.active_timeframe || '5m';
        setSymbol(currentSymbol);
        setTimeframe(currentTimeframe);
        if (status.config) {
          setStrategyConfig(prev => ({
            ...prev,
            ...status.config,
            custom_indicators: prev.custom_indicators?.map(ind => {
              const matchedConfig = status.config?.custom_indicators?.find((c_ind: IndicatorConfig) => c_ind.type === ind.type);
              return matchedConfig ? { ...ind, params: { ...ind.params, ...matchedConfig.params } } : ind;
            })
          }));
        }
      } else {
        setStrategyConfig(prev => ({
          ...prev,
          ...DEFAULT_CONFIG,
          custom_indicators: [
            { type: 'bollinger_bands', params: { period: DEFAULT_CONFIG.bb_period, num_std: DEFAULT_CONFIG.bb_std } },
            { type: 'fibonacci_pivots', params: { timeframe: DEFAULT_CONFIG.fib_timeframe, lookback: DEFAULT_CONFIG.fib_lookback } }
          ]
        }));
      }

      const trades = await getJournalTrades(currentSymbol, '', 100);
      setPaperTrades(trades.trades || []);
      const stats = await getJournalStats(currentSymbol);
      setJournalStats(stats);

    } catch (err: unknown) {
      console.error("Error fetching status:", err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data.');
      setEngineStatus(null);
      setPaperTrades([]);
      setJournalStats(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggleEngine = async () => {
    if (!engineStatus) return;

    try {
      setLoading(true);
      if (engineStatus.is_running) {
        await stopPaperEngine();
      } else {
        await updatePaperConfig({
          symbol: symbol,
          timeframe: timeframe,
          config: strategyConfig
        });
        await startPaperEngine();
      }
      await fetchStatus();
    } catch (err: unknown) {
      console.error("Error toggling engine:", err);
      setError(err instanceof Error ? err.message : 'Failed to toggle engine.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = <K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) => {
    setStrategyConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleIndicatorConfigChange = (indicatorType: string, newParams: Record<string, unknown>) => {
    setStrategyConfig(prev => {
      const existingIndicators = prev.custom_indicators || [];
      const indicatorIndex = existingIndicators.findIndex(ind => ind.type === indicatorType);
      let updatedIndicators;

      if (indicatorIndex === -1) {
        updatedIndicators = [...existingIndicators, { type: indicatorType, params: newParams }];
      } else {
        updatedIndicators = [...existingIndicators];
        updatedIndicators[indicatorIndex] = { ...updatedIndicators[indicatorIndex], params: { ...updatedIndicators[indicatorIndex].params, ...newParams } };
      }

      return {
        ...prev,
        custom_indicators: updatedIndicators
      };
    });
  };

  const BB_CONFIG = (strategyConfig.custom_indicators?.find(ind => ind.type === 'bollinger_bands')?.params || { period: DEFAULT_CONFIG.bb_period, num_std: DEFAULT_CONFIG.bb_std }) as Record<string, unknown>;
  const FIB_CONFIG = (strategyConfig.custom_indicators?.find(ind => ind.type === 'fibonacci_pivots')?.params || { timeframe: DEFAULT_CONFIG.fib_timeframe, lookback: DEFAULT_CONFIG.fib_lookback }) as Record<string, unknown>;

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      await updatePaperConfig({
        symbol: symbol,
        timeframe: timeframe,
        config: strategyConfig
      });
      alert('Configuration saved successfully!');
      fetchStatus();
    } catch (err: unknown) {
      console.error("Error saving config:", err);
      setError(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number | null | undefined) => price !== null && price !== undefined ? price.toFixed(2) : 'N/A';
  const formatPercentage = (pct: number | null | undefined) => pct !== null && pct !== undefined ? pct.toFixed(2) + '%' : 'N/A';

  if (loading && !engineStatus) return <div className="loading-indicator">Loading Testing & Paper Run...</div>;

  return (
    <main className="testing-view-container">
      <header className="testing-view-header">
        <div className="header-title-wrapper">
          <h2 className="view-title">Paper Trading Engine</h2>
          <span className="view-subtitle">Automated Execution & MTF Signal Confluence</span>
        </div>
        <div className="engine-controls">
          <button onClick={handleToggleEngine} className={`control-btn ${engineStatus?.is_running ? 'running' : ''}`}>
            {engineStatus?.is_running ? 'Stop Engine' : 'Start Engine'}
          </button>
          <span className={`status-indicator ${engineStatus?.is_running ? 'running' : 'stopped'}`}>
            {engineStatus?.is_running ? '🟢 Running' : '⚪ Stopped'}
          </span>
          <span className="trade-quota">
            Trades Today: {engineStatus?.daily_trades_today ?? 0} / {engineStatus?.max_daily_trades ?? 3}
          </span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={engineStatus?.is_running}>
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="XAUUSD">XAUUSD</option>
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} disabled={engineStatus?.is_running}>
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
          </select>
          <button onClick={handleSaveConfig} disabled={engineStatus?.is_running} className="control-btn save-btn">Save Config</button>
        </div>
      </header>

      <div className="testing-view-grid">
        <aside className="config-panel">
          <h3 className="panel-title">Strategy Configuration</h3>
          <div className="config-tab-nav">
            <button className="config-tab-btn active">Core Signals</button>
            <button className="config-tab-btn">Execution & Risk</button>
            <button className="config-tab-btn">Confluence</button>
          </div>

          <section className="config-section">
            <h4 className="config-section-title">Bollinger Bands (5m/15m)</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bb-period">Period</label>
                <input
                  id="bb-period"
                  type="number"
                  value={Number(BB_CONFIG.period ?? DEFAULT_CONFIG.bb_period)}
                  onChange={(e) => handleIndicatorConfigChange('bollinger_bands', { ...BB_CONFIG, period: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bb-stddev">StdDev</label>
                <input
                  id="bb-stddev"
                  type="number"
                  step="0.1"
                  value={Number(BB_CONFIG.num_std ?? DEFAULT_CONFIG.bb_std)}
                  onChange={(e) => handleIndicatorConfigChange('bollinger_bands', { ...BB_CONFIG, num_std: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </section>

          <section className="config-section">
            <h4 className="config-section-title">Fibonacci Pivots (Daily)</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fib-timeframe">Timeframe</label>
                <select
                  id="fib-timeframe"
                  value={String(FIB_CONFIG.timeframe ?? DEFAULT_CONFIG.fib_timeframe)}
                  onChange={(e) => handleIndicatorConfigChange('fibonacci_pivots', { ...FIB_CONFIG, timeframe: e.target.value })}
                >
                  <option value="daily">Daily</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="fib-lookback">Lookback</label>
                <input
                  id="fib-lookback"
                  type="number"
                  value={Number(FIB_CONFIG.lookback ?? DEFAULT_CONFIG.fib_lookback)}
                  onChange={(e) => handleIndicatorConfigChange('fibonacci_pivots', { ...FIB_CONFIG, lookback: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </section>

          <section className="config-section">
            <h4 className="config-section-title">Risk & Confluence</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="risk-pct">Risk % per Trade</label>
                <input
                  id="risk-pct"
                  type="number"
                  step="0.1"
                  value={strategyConfig.risk_pct || DEFAULT_CONFIG.risk_pct}
                  onChange={(e) => handleConfigChange('risk_pct', parseFloat(e.target.value) || DEFAULT_CONFIG.risk_pct)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="stop-loss-buffer">Stop Loss Buffer</label>
                <input
                  id="stop-loss-buffer"
                  type="number"
                  step="0.0001"
                  value={strategyConfig.stop_buffer || DEFAULT_CONFIG.stop_buffer}
                  onChange={(e) => handleConfigChange('stop_buffer', parseFloat(e.target.value) || DEFAULT_CONFIG.stop_buffer)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="min-confluence-score">Min Confluence Score</label>
                <input
                  id="min-confluence-score"
                  type="number"
                  value={strategyConfig.confluence_settings?.min_score || DEFAULT_CONFIG.min_confluence_score}
                  onChange={(e) => handleConfigChange('confluence_settings', { ...strategyConfig.confluence_settings, min_score: parseInt(e.target.value) || DEFAULT_CONFIG.min_confluence_score })}
                />
              </div>
            </div>
          </section>
        </aside>

        <section className="live-data-panel">
          <h3 className="panel-title">Live Feed & Analytics</h3>
          {error && <div className="error-banner">{error}</div>}

          <div className="status-section">
            <h4 className="status-section-title">Engine Status</h4>
            {engineStatus ? (
              <div className="engine-status-details">
                <div className="status-grid">
                  <div className="status-item"><span>Symbol:</span> <strong>{engineStatus.active_symbol}</strong></div>
                  <div className="status-item"><span>Timeframe:</span> <strong>{engineStatus.active_timeframe}</strong></div>
                  <div className="status-item"><span>Running:</span> <strong className={engineStatus.is_running ? 'text-positive' : 'text-muted'}>{engineStatus.is_running ? 'Active' : 'Stopped'}</strong></div>
                  <div className="status-item"><span>Daily Quota:</span> <strong>{engineStatus.daily_trades_today} / {engineStatus.max_daily_trades}</strong></div>
                </div>
                {engineStatus.open_positions.length > 0 ? (
                  <div className="open-positions">
                    <h5>Open Positions:</h5>
                    <ul>
                      {engineStatus.open_positions.map((pos, index) => (
                        <li key={index}>
                          <span className={`badge-side ${pos.direction}`}>{pos.direction.toUpperCase()}</span>
                          <span>{pos.symbol} @ {formatPrice(pos.entry_price)}</span>
                          <span>SL: {formatPrice(pos.stop_loss)}</span>
                          <span>TP: {formatPrice(pos.take_profit)}</span>
                          <span className={pos.pnl >= 0 ? 'text-positive' : 'text-negative'}>PnL: {formatPrice(pos.pnl)} ({formatPercentage(pos.pnl_pct)})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="no-positions">No open positions currently active.</p>
                )}
              </div>
            ) : (
              <p>Connecting to engine status...</p>
            )}
          </div>

          <div className="trades-section">
            <h4 className="trades-section-title">Recent Paper Trades</h4>
            {paperTrades.length === 0 ? (
              <p className="no-trades">No paper trades executed in this session yet.</p>
            ) : (
              <div className="trades-table-wrapper">
                <table className="trades-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>Reason</th>
                      <th>PnL</th>
                      <th>Return</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperTrades.map((trade) => (
                      <tr key={trade.id}>
                        <td><strong>{trade.symbol}</strong></td>
                        <td><span className={`badge-side ${trade.direction.toLowerCase()}`}>{trade.direction}</span></td>
                        <td>{formatPrice(trade.entry_price)}</td>
                        <td>{formatPrice(trade.exit_price)}</td>
                        <td>{trade.exit_reason || 'N/A'}</td>
                        <td className={trade.pnl !== null && trade.pnl >= 0 ? 'text-positive' : 'text-negative'}>{formatPrice(trade.pnl)}</td>
                        <td className={trade.pnl_pct !== null && trade.pnl_pct >= 0 ? 'text-positive' : 'text-negative'}>{formatPercentage(trade.pnl_pct)}</td>
                        <td>{new Date(trade.trade_date).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="stats-section">
            <h4 className="stats-section-title">Backtest Performance</h4>
            {journalStats ? (
              <div className="strategy-stats-grid">
                <div className="stat-box"><small>Total Return</small><strong className={journalStats.total_return >= 0 ? 'text-positive' : 'text-negative'}>{formatPercentage(journalStats.total_return)}</strong></div>
                <div className="stat-box"><small>Win Rate</small><strong>{formatPercentage(journalStats.win_rate)}</strong></div>
                <div className="stat-box"><small>Profit Factor</small><strong>{journalStats.profit_factor?.toFixed(2) || 'N/A'}</strong></div>
                <div className="stat-box"><small>Max Drawdown</small><strong className='text-negative'>-{journalStats.max_drawdown?.toFixed(2) || 'N/A'}%</strong></div>
                <div className="stat-box"><small>Sharpe Ratio</small><strong>{journalStats.sharpe?.toFixed(2) || 'N/A'}</strong></div>
                <div className="stat-box"><small>Total Trades</small><strong>{journalStats.total_trades || 0}</strong></div>
              </div>
            ) : (
              <p>No backtest metrics computed yet.</p>
            )}
            <button onClick={() => runBacktest({ strategy: strategyConfig, symbol: symbol, timeframe: timeframe })} disabled={engineStatus?.is_running} className="run-backtest-btn">Run Backtest Simulation</button>
          </div>
        </section>
      </div>
    </main>
  );
}
