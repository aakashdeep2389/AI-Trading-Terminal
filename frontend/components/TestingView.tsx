import { useState, useEffect, useCallback, useRef } from 'react';
import { StrategyConfig, DEFAULT_ADVANCED_SETTINGS, DEFAULT_MARKETPLACE_SETTINGS } from '../config/strategy.config'; // Assuming this path is correct
import { getMarketStatus } from '../api/market'; // Example API call
import { runBacktest } from '../api/backtesting'; // Example API call
import { getJournalTrades, getJournalStats } from '../api/journal'; // Example API calls
import { getPaperTradingStatus, startPaperEngine, stopPaperEngine, updatePaperConfig } from '../api/paper'; // Example API calls

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
}

const DEFAULT_CONFIG = {
  bb_period: 20,
  bb_std: 1.4,
  risk_pct: 1.0,
  min_confluence_score: 0,
  fib_timeframe: 'daily',
  fib_lookback: 15,
  stop_buffer: 0.001 // Example buffer as a percentage of price
};

export default function TestingView() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [engineStatus, setEngineStatus] = useState<PaperEngineStatus | null>(null);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>({
    name: 'Bollinger Bands MTF Paper',
    fast: 20, // Placeholder values, will be overridden by config
    slow: 50, // Placeholder values
    risk_pct: DEFAULT_CONFIG.risk_pct,
    stop_atr_multiple: 2.0, // Placeholder, actual SL calculation is dynamic
    custom_indicators: [],
    universal_exit: { description: '', conditions: [] },
    overnight_protection: { description: '' },
    advanced_settings: DEFAULT_ADVANCED_SETTINGS,
    marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS
  });
  const [paperTrades, setPaperTrades] = useState<Trade[]>([]);
  const [journalStats, setJournalStats] = useState<any>(null); // Use a more specific type if available
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const status = await getPaperTradingStatus();
      setEngineStatus(status);
      setError(null);

      // Fetch and set current strategy config if engine is active or on load
      if (status && status.active_symbol) {
        setSymbol(status.active_symbol);
        setTimeframe(status.timeframe || '5m');
        // Ideally, fetch the *actual* config from backend, not just use default
        setStrategyConfig(prev => ({ ...prev, ...status.config }));
      } else {
         // If engine is not active, load default config
         setStrategyConfig(prev => ({ ...prev, ...DEFAULT_CONFIG }));
      }

      const trades = await getJournalTrades(status?.active_symbol || symbol, '', 100);
      setPaperTrades(trades.trades || []);
      const stats = await getJournalStats(status?.active_symbol || symbol);
      setJournalStats(stats);

    } catch (err: any) {
      setError(err.message || 'Failed to fetch data.');
    } finally {
      setLoading(false);
    }
  }, [symbol]); // Depend on symbol to refetch trades/stats when symbol changes

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
        // Apply current strategy config before starting
        await updatePaperConfig({
          symbol: symbol,
          timeframe: timeframe,
          config: strategyConfig
        });
        await startPaperEngine();
      }
      await fetchStatus(); // Refresh status after action
    } catch (err: any) {
      setError(err.message || 'Failed to toggle engine.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (key: keyof StrategyConfig, value: any) => {
    setStrategyConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleAdvancedConfigChange = (key: keyof StrategyConfig['advanced_settings'], value: any) => {
      setStrategyConfig(prev => ({
          ...prev,
          advanced_settings: {
              ...prev.advanced_settings,
              [key]: value
          }
      }));
  };

  // Handler for BB and Fib config changes specifically
  const handleIndicatorConfigChange = (indicatorType: string, newParams: any) => {
      setStrategyConfig(prev => {
          const existingIndicators = prev.custom_indicators || [];
          const indicatorIndex = existingIndicators.findIndex(ind => ind.type === indicatorType);
          let updatedIndicators;

          if (indicatorIndex === -1) {
              // Add new indicator if not present
              updatedIndicators = [...existingIndicators, { type: indicatorType, params: newParams }];
          } else {
              // Update existing indicator
              updatedIndicators = [...existingIndicators];
              updatedIndicators[indicatorIndex] = { ...updatedIndicators[indicatorIndex], params: { ...updatedIndicators[indicatorIndex].params, ...newParams } };
          }

          return {
              ...prev,
              custom_indicators: updatedIndicators
          };
      });
  };

  const BB_CONFIG = strategyConfig.custom_indicators?.find(ind => ind.type === 'bollinger_bands')?.params || DEFAULT_CONFIG;
  const FIB_CONFIG = strategyConfig.custom_indicators?.find(ind => ind.type === 'fibonacci_pivots')?.params || DEFAULT_CONFIG;

  const handleSaveConfig = async () => {
      try {
          setLoading(true);
          await updatePaperConfig({
              symbol: symbol,
              timeframe: timeframe,
              config: strategyConfig
          });
          alert('Configuration saved successfully!'); // User feedback
          fetchStatus(); // Refresh to show updated config if needed
      } catch (err: any) {
          setError(err.message || 'Failed to save configuration.');
      } finally {
          setLoading(false);
      }
  };

  const formatPrice = (price: number | null | undefined) => price !== null && price !== undefined ? price.toFixed(2) : 'N/A';
  const formatPercentage = (pct: number | null | undefined) => pct !== null && pct !== undefined ? pct.toFixed(2) + '%' : 'N/A';

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <main className="testing-container">
      <header className="testing-header">
        <h2>Paper Trading Engine</h2>
        <div className="engine-controls">
          <button onClick={handleToggleEngine} className={engineStatus?.is_running ? 'running' : ''}>
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
          <button onClick={handleSaveConfig} disabled={engineStatus?.is_running}>Save Config</button>
        </div>
      </header>

      <div className="testing-grid">
        {/* Left Panel: Strategy Configuration */}
        <aside className="config-panel">
          <h3>Strategy Configuration</h3>

          {/* Core Signals Tab Navigation */}
          <div className="config-tab-nav">
              <button className="config-tab-btn active">Core Signals</button>
              <button className="config-tab-btn">Execution & Risk</button>
              <button className="config-tab-btn">Confluence</button>
          </div>

          <div className="config-section">
            <h4>Bollinger Bands (5m/15m)</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Period</label>
                <input type="number" value={BB_CONFIG.period || DEFAULT_CONFIG.bb_period} onChange={(e) => handleIndicatorConfigChange('bollinger_bands', { ...BB_CONFIG, period: parseInt(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>StdDev</label>
                <input type="number" step="0.1" value={BB_CONFIG.num_std || DEFAULT_CONFIG.bb_std} onChange={(e) => handleIndicatorConfigChange('bollinger_bands', { ...BB_CONFIG, num_std: parseFloat(e.target.value) })} />
              </div>
            </div>
            {/* Add more BB params if needed */}
          </div>

          <div className="config-section">
            <h4>Fibonacci Pivots (Daily)</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Timeframe</label>
                <select value={FIB_CONFIG.timeframe || DEFAULT_CONFIG.fib_timeframe} onChange={(e) => handleIndicatorConfigChange('fibonacci_pivots', { ...FIB_CONFIG, timeframe: e.target.value })}>
                  <option value="daily">Daily</option>
                  {/* Add other timeframes if supported by backend */}
                </select>
              </div>
              <div className="form-group">
                <label>Lookback</label>
                <input type="number" value={FIB_CONFIG.lookback || DEFAULT_CONFIG.fib_lookback} onChange={(e) => handleIndicatorConfigChange('fibonacci_pivots', { ...FIB_CONFIG, lookback: parseInt(e.target.value) })} />
              </div>
            </div>
          </div>

          <div className="config-section">
            <h4>Risk & Confluence</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Risk % per Trade</label>
                <input type="number" step="0.1" value={strategyConfig.risk_pct || DEFAULT_CONFIG.risk_pct} onChange={(e) => handleConfigChange('risk_pct', parseFloat(e.target.value) || DEFAULT_CONFIG.risk_pct)} />
              </div>
              <div className="form-group">
                <label>Stop Loss Buffer</label>
                <input type="number" step="0.0001" value={DEFAULT_CONFIG.stop_buffer} onChange={(e) => handleConfigChange('stop_buffer', parseFloat(e.target.value) || DEFAULT_CONFIG.stop_buffer)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Min Confluence Score</label>
                <input type="number" value={strategyConfig.confluence_settings?.min_score || DEFAULT_CONFIG.min_confluence_score} onChange={(e) => handleConfigChange('confluence_settings', { ...strategyConfig.confluence_settings, min_score: parseInt(e.target.value) || DEFAULT_CONFIG.min_confluence_score })} />
              </div>
            </div>
          </div>

        </aside>

        {/* Right Panel: Live Data & Trade Feed */}
        <section className="live-data-panel">
          <h3>Live Feed</h3>

          {error && <div className="error-banner">{error}</div>}

          <div className="status-section">
            <h4>Engine Status</h4>
            {engineStatus ? (
              <div className="engine-status-details">
                <p>Symbol: {engineStatus.active_symbol}</p>
                <p>Timeframe: {engineStatus.timeframe}</p>
                <p>Running: {engineStatus.is_running ? 'Yes' : 'No'}</p>
                <p>Trades Today: {engineStatus.daily_trades_today} / {engineStatus.max_daily_trades}</p>
                {engineStatus.open_positions.length > 0 ? (
                  <div>
                    <h5>Open Positions:</h5>
                    <ul>
                      {engineStatus.open_positions.map((pos, index) => (
                        <li key={index}>
                          {pos.direction.toUpperCase()} {pos.symbol} @ {formatPrice(pos.entry_price)} (SL: {formatPrice(pos.stop_loss)}, TP: {formatPrice(pos.take_profit)}) - PnL: {formatPrice(pos.pnl)} ({formatPercentage(pos.pnl_pct)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>No open positions.</p>
                )}
              </div>
            ) : (
              <p>Loading engine status...</p>
            )}
          </div>

          <div className="trades-section">
            <h4>Recent Paper Trades</h4>
            {loading && <p>Loading trades...</p>}
            {!loading && paperTrades.length === 0 ? (
              <p>No trades executed yet.</p>
            ) : (
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th>Reason</th><th>PnL</th><th>Return</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paperTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td>{trade.symbol}</td>
                      <td>{trade.direction}</td>
                      <td>{formatPrice(trade.entry_price)}</td>
                      <td>{formatPrice(trade.exit_price)}</td>
                      <td>{trade.exit_reason || 'N/A'}</td>
                      <td className={trade.pnl !== null && trade.pnl >= 0 ? 'text-positive' : 'text-negative'}>{formatPrice(trade.pnl)}</td>
                      <td className={trade.pnl_pct !== null && trade.pnl_pct >= 0 ? 'text-positive' : 'text-negative'}>{formatPercentage(trade.pnl_pct)}</td>
                      <td>{new Date(trade.trade_date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="stats-section">
             <h4>Backtest Performance</h4>
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
                 <p>Loading stats...</p>
             )}
             <button onClick={() => runBacktest({ strategy: strategyConfig, symbol: symbol, timeframe: timeframe })} disabled={engineStatus?.is_running}>Run Backtest</button>
          </div>
        </section>
      </div>
    </main>
  );
}
