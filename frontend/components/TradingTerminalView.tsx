'use client';

import type { RefObject } from 'react';
import type { Analysis } from '../lib/schemas';
import MarketChart from './MarketChart';
import TradingViewWidget from './TradingViewWidget';
import StatsTicker from './StatsTicker';
import AnalysisPanel from './AnalysisPanel';
import AlertsPanel from './AlertsPanel';
import IndicatorMenu, { type IndicatorStates } from './IndicatorMenu';
import InstrumentSelect from './InstrumentSelect';
import type { Alert, AlertFormInput } from '../lib/schemas';

type Theme = 'dark' | 'light';
type ChartEngine = 'lightweight' | 'tradingview';

interface TradingTerminalViewProps {
  symbol: string;
  timeframe: string;
  analysis: Analysis | null;
  loading: boolean;
  alerts: Alert[];
  indicators: IndicatorStates;
  theme: Theme;
  chartEngine: ChartEngine;
  isFullscreen: boolean;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: string) => void;
  onIndicatorToggle: (key: keyof IndicatorStates, value: boolean) => void;
  onChartEngineChange: (engine: ChartEngine) => void;
  onToggleFullscreen: () => void;
  onCandleClosed: (event: { symbol?: string; timeframe?: string; data?: { time: number; open: number; high: number; low: number; close: number; volume: number } }) => void;
  onLiveCandle: (candle: { time: number; open: number; high: number; low: number; close: number; volume: number }) => void;
  onRefreshChart: () => void;
  refreshing: boolean;
  refreshKey: number;
  onRefreshAnalysis: () => void;
  onCreateAlert: (input: AlertFormInput) => void;
  onToggleAlert: (id: string, enabled: boolean) => void;
  onDeleteAlert: (id: string) => void;
}

function display(value: number | undefined, digits = 2) {
  return value === undefined || !Number.isFinite(value) ? 'Unavailable' : value.toFixed(digits);
}

export default function TradingTerminalView({
  symbol,
  timeframe,
  analysis,
  loading,
  alerts,
  indicators,
  theme,
  chartEngine,
  isFullscreen,
  chartContainerRef,
  onSymbolChange,
  onTimeframeChange,
  onIndicatorToggle,
  onChartEngineChange,
  onToggleFullscreen,
  onCandleClosed,
  onLiveCandle,
  onRefreshChart,
  refreshing,
  refreshKey,
  onRefreshAnalysis,
  onCreateAlert,
  onToggleAlert,
  onDeleteAlert,
}: TradingTerminalViewProps) {
  const currentPrice = analysis?.price;
  const change = analysis?.indicators?.change24h_pct;
  const trend = analysis?.indicators?.trend;
  const risk = analysis?.risk;
  const isDirectional = risk?.direction === 'long' || risk?.direction === 'short';

  return (
    <section className="trading-terminal-view" aria-labelledby="terminal-title">
      <header className="terminal-instrument-header">
        <div className="terminal-instrument-identity">
          <InstrumentSelect currentSymbol={symbol} onSelectSymbol={onSymbolChange} />
          <div className="terminal-instrument-title">
            <div className="terminal-title-line">
              <h2 id="terminal-title">{symbol}</h2>
              <span className="terminal-live-badge"><span className="status-dot online" aria-hidden="true" />LIVE</span>
            </div>
            <span className="terminal-instrument-subtitle">{symbol === 'BTCUSDT' ? 'Bitcoin / Tether' : symbol === 'XAUUSD' ? 'Gold / US Dollar' : 'Market instrument'} · {timeframe} analysis</span>
          </div>
        </div>
        <div className="terminal-price-context">
          <div className="terminal-last-price">{display(currentPrice)}</div>
          <div className={`terminal-price-change ${typeof change === 'number' && change >= 0 ? 'positive' : 'negative'}`}>{typeof change === 'number' ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : 'Change unavailable'} <span>24H</span></div>
        </div>
        <div className="terminal-market-state">
          <span className="terminal-state-label">MARKET STATE</span>
          <strong className={`trend-${trend || 'neutral'}`}>{trend || 'Unavailable'}</strong>
          <span className="terminal-state-source">Provider data · backend analysis</span>
        </div>
      </header>

      <div className="terminal-workspace">
        <div className="terminal-chart-column">
          <StatsTicker analysis={analysis} symbol={symbol} timeframe={timeframe} />
          <div className={`chart-fullscreen-wrapper terminal-chart-wrapper ${isFullscreen ? 'is-fullscreen' : ''}`} ref={chartContainerRef}>
            <div className="terminal-chart-toolbar">
              <div className="terminal-toolbar-group">
                <span className="terminal-toolbar-label">TIMEFRAME</span>
                <div className="timeframe-pills">
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => <button key={tf} type="button" className={`tf-btn ${timeframe === tf ? 'active' : ''}`} onClick={() => onTimeframeChange(tf)}>{tf}</button>)}
                </div>
              </div>
              <div className="terminal-toolbar-actions">
                <IndicatorMenu indicators={indicators} onToggle={onIndicatorToggle} />
                <div className="engine-switcher-pills"><button type="button" className={chartEngine === 'lightweight' ? 'active' : ''} onClick={() => onChartEngineChange('lightweight')}>Lightweight</button><button type="button" className={chartEngine === 'tradingview' ? 'active' : ''} onClick={() => onChartEngineChange('tradingview')}>TradingView</button></div>
                <button type="button" className="fullscreen-btn" onClick={onRefreshChart} disabled={refreshing} aria-label="Refresh chart">{refreshing ? 'Refreshing…' : 'Refresh'}</button>
                <button type="button" className={`fullscreen-btn ${isFullscreen ? 'active' : ''}`} onClick={onToggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{isFullscreen ? 'Exit' : 'Fullscreen'}</button>
              </div>
            </div>
            <div className="chart-viewport-card">
              {chartEngine === 'lightweight' ? <MarketChart symbol={symbol} timeframe={timeframe} indicators={indicators} theme={theme} onCandleClosed={onCandleClosed} onLiveCandle={onLiveCandle} refreshKey={refreshKey} /> : <TradingViewWidget symbol={symbol} timeframe={timeframe} theme={theme} />}
            </div>
          </div>

          <section className="terminal-indicator-strip" aria-label="Backend indicator summary">
            <div className="terminal-indicator-header"><div><span className="section-eyebrow">TECHNICALS</span><h3>Indicator monitor</h3></div><span className="panel-live-label">BACKEND COMPUTED</span></div>
            <div className="terminal-indicator-grid">
              <div><span>EMA 9</span><strong>Unavailable</strong></div>
              <div><span>EMA 20</span><strong>{display(analysis?.indicators?.ema20)}</strong></div>
              <div><span>EMA 50</span><strong>{display(analysis?.indicators?.ema50)}</strong></div>
              <div><span>EMA 200</span><strong>{display(analysis?.indicators?.ema200)}</strong></div>
              <div><span>RSI 14</span><strong>{display(analysis?.indicators?.rsi14)}</strong></div>
              <div><span>ATR 14</span><strong>{display(analysis?.indicators?.atr14)}</strong></div>
              <div><span>Bollinger</span><strong>Unavailable</strong></div>
              <div><span>VWAP / Pivots</span><strong>Unavailable</strong></div>
            </div>
          </section>
        </div>

        <aside className="terminal-context-column">
          <section className="terminal-signal-card">
            <div className="terminal-context-header"><div><span className="section-eyebrow">EXECUTION CONTEXT</span><h3>Trading signal</h3></div><span className={`signal-state ${isDirectional ? 'active' : ''}`}>{isDirectional ? 'ACTIVE' : 'NO SIGNAL'}</span></div>
            {isDirectional && risk ? <><div className="terminal-signal-direction"><strong className={risk.direction === 'long' ? 'positive' : 'negative'}>{risk.direction === 'long' ? 'BUY' : 'SELL'}</strong><span>{timeframe} · backend risk pipeline</span></div><div className="terminal-level-list"><div><span>Entry</span><strong>{display(risk.entry)}</strong></div><div><span>Stop loss</span><strong className="negative">{display(risk.stop_loss)}</strong></div><div><span>Take profit</span><strong className="positive">{display(risk.target)}</strong></div><div><span>Risk / reward</span><strong>{display(risk.risk_reward)}</strong></div></div><p className="terminal-signal-reason">{risk.reason || 'No additional rationale supplied by the backend.'}</p></> : <div className="terminal-unavailable"><strong>No directional signal</strong><span>Entry, stop and target levels will appear when the backend supplies an active signal.</span></div>}
          </section>
          <AnalysisPanel symbol={symbol} timeframe={timeframe} analysis={analysis} loading={loading} onRefresh={onRefreshAnalysis} />
          <AlertsPanel symbol={symbol} alerts={alerts} currentPrice={currentPrice} onCreate={onCreateAlert} onToggle={onToggleAlert} onDelete={onDeleteAlert} />
        </aside>
      </div>
    </section>
  );
}
