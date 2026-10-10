'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  alertNotificationSchema,
  alertSchema,
  type Alert,
  type AlertFormInput,
  type Analysis,
} from '../lib/schemas';
import MarketChart from '../components/MarketChart';
import TradingViewWidget from '../components/TradingViewWidget';
import StrategiesView from '../components/StrategiesView';
import TradingJournalView from '../components/TradingJournalView';
import IndicatorMenu, { type IndicatorStates } from '../components/IndicatorMenu';
import StatsTicker from '../components/StatsTicker';
import AnalysisPanel from '../components/AnalysisPanel';
import AlertsPanel from '../components/AlertsPanel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface AlertToast {
  alert_id?: string;
  symbol: string;
  message: string;
}

export default function Home() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertNotifications, setAlertNotifications] = useState<AlertToast[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [chartEngine, setChartEngine] = useState<'lightweight' | 'tradingview'>('lightweight');
  const [activeTab, setActiveTab] = useState<'chart' | 'strategies' | 'journal'>('chart');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!chartContainerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await chartContainerRef.current.requestFullscreen();
      } catch (err) {
        console.error('Failed to enter fullscreen:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.error('Failed to exit fullscreen:', err);
      }
    }
  };

  // Indicator toggles state
  const [indicators, setIndicators] = useState<IndicatorStates>({
    showEMA20: true,
    showEMA50: true,
    showEMA200: true,
    showSupportResistance: true,
    showPatterns: true,
    showVolume: true,
  });

  // Sync theme with localStorage or system preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('app-theme') as 'dark' | 'light' | null;
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      const initial = prefersLight ? 'light' : 'dark';
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    }
  }, []);

  const setThemeMode = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Sync chart engine with localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('app-chart-engine') as 'lightweight' | 'tradingview' | null;
    if (saved === 'lightweight' || saved === 'tradingview') {
      setChartEngine(saved);
    }
  }, []);

  const setChartEngineMode = (engine: 'lightweight' | 'tradingview') => {
    setChartEngine(engine);
    localStorage.setItem('app-chart-engine', engine);
  };

  // Load indicator preferences
  useEffect(() => {
    try {
      const savedEMA20 = localStorage.getItem('chart-show-ema-20');
      const savedEMA50 = localStorage.getItem('chart-show-ema-50');
      const savedEMA200 = localStorage.getItem('chart-show-ema-200');
      const savedSR = localStorage.getItem('chart-show-support-resistance');
      const savedPatterns = localStorage.getItem('chart-show-patterns');
      const savedVolume = localStorage.getItem('chart-show-volume');

      setIndicators({
        showEMA20: savedEMA20 !== null ? JSON.parse(savedEMA20) : true,
        showEMA50: savedEMA50 !== null ? JSON.parse(savedEMA50) : true,
        showEMA200: savedEMA200 !== null ? JSON.parse(savedEMA200) : true,
        showSupportResistance: savedSR !== null ? JSON.parse(savedSR) : true,
        showPatterns: savedPatterns !== null ? JSON.parse(savedPatterns) : true,
        showVolume: savedVolume !== null ? JSON.parse(savedVolume) : true,
      });
    } catch {
      // fallback to defaults
    }
  }, []);

  const handleIndicatorToggle = (key: keyof IndicatorStates, value: boolean) => {
    setIndicators((prev) => ({ ...prev, [key]: value }));
    const storageKeys: Record<keyof IndicatorStates, string> = {
      showEMA20: 'chart-show-ema-20',
      showEMA50: 'chart-show-ema-50',
      showEMA200: 'chart-show-ema-200',
      showSupportResistance: 'chart-show-support-resistance',
      showPatterns: 'chart-show-patterns',
      showVolume: 'chart-show-volume',
    };
    localStorage.setItem(storageKeys[key], JSON.stringify(value));
  };

  // Load alerts
  useEffect(() => {
    async function loadAlerts() {
      try {
        const response = await fetch(`${API}/api/alerts?symbol=${symbol}`);
        if (response.ok) {
          const data = await response.json();
          setAlerts(data.alerts || []);
        }
      } catch (error) {
        console.error('Failed to load alerts:', error);
      }
    }
    loadAlerts();
  }, [symbol]);

  // WebSocket for alert notifications
  useEffect(() => {
    let alertSocket: WebSocket | null = null;
    try {
      alertSocket = new WebSocket(`${API.replace(/^http/, 'ws')}/api/ws/alerts`);
      alertSocket.onmessage = (event) => {
        try {
          const parsed = alertNotificationSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success) return;
          const { data } = parsed.data;
          setAlertNotifications((prev) => [data, ...prev.slice(0, 4)]);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`Alert: ${data.symbol}`, {
              body: data.message,
              icon: '/favicon.ico',
            });
          }
        } catch {
          // ignore malformed frame
        }
      };
    } catch {
      // ignore ws error
    }

    return () => {
      alertSocket?.close();
    };
  }, []);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/analysis/${symbol}?timeframe=${timeframe}`);
      if (res.ok) {
        setAnalysis(await res.json());
      }
    } catch (err) {
      console.error('Failed to analyze:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Run initial analysis when symbol/timeframe changes
  useEffect(() => {
    analyze();
  }, [analyze]);

  async function createAlert(alertData: AlertFormInput) {
    try {
      const response = await fetch(`${API}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...alertData, symbol }),
      });
      if (response.ok) {
        const newAlert = alertSchema.parse(await response.json());
        setAlerts((prev) => [newAlert, ...prev]);
      }
    } catch (error) {
      console.error('Failed to create alert:', error);
    }
  }

  async function toggleAlert(alertId: string, enabled: boolean) {
    try {
      const response = await fetch(`${API}/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) {
        setAlerts((prev) =>
          prev.map((alert) => (alert.id === alertId ? { ...alert, enabled } : alert))
        );
      }
    } catch (error) {
      console.error('Failed to toggle alert:', error);
    }
  }

  async function deleteAlert(alertId: string) {
    try {
      const response = await fetch(`${API}/api/alerts/${alertId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      }
    } catch (error) {
      console.error('Failed to delete alert:', error);
    }
  }

  return (
    <main>
      {/* Terminal Top Header */}
      <header className="terminal-header">
        <div className="header-brand">
          <span className="brand-badge">PRO</span>
          <div>
            <h1 className="brand-title">AI Trading Platform</h1>
            <span className="sub">BTCUSDT • XAUUSD</span>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="header-nav-tabs" role="tablist" aria-label="Main Navigation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chart'}
            className={`nav-tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
            onClick={() => setActiveTab('chart')}
          >
            <span className="tab-icon">📈</span>
            <span>Chart & Analysis</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'strategies'}
            className={`nav-tab-btn ${activeTab === 'strategies' ? 'active' : ''}`}
            onClick={() => setActiveTab('strategies')}
          >
            <span className="tab-icon">⚡</span>
            <span>Strategies & Backtest</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'journal'}
            className={`nav-tab-btn ${activeTab === 'journal' ? 'active' : ''}`}
            onClick={() => setActiveTab('journal')}
          >
            <span className="tab-icon">📝</span>
            <span>Trading Journal</span>
          </button>
        </nav>

        {/* Header Right Controls */}
        <div className="header-controls">
          <div className="control-group">
            <div className="pills symbol-pills">
              {['BTCUSDT', 'XAUUSD'].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={symbol === item ? 'active' : ''}
                  onClick={() => setSymbol(item)}
                >
                  {item === 'BTCUSDT' ? '₿ BTCUSDT' : '🪙 XAUUSD'}
                </button>
              ))}
            </div>
          </div>

          <div className="header-divider-vertical" />

          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => setThemeMode(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="header-separator-line" role="separator" aria-orientation="horizontal" />

      {/* Floating Alert Notifications */}
      {alertNotifications.length > 0 && (
        <section className="alert-notifications">
          {alertNotifications.map((notification, index) => (
            <div key={index} className="alert-notification">
              🚨 <strong>{notification.symbol}</strong>: {notification.message}
            </div>
          ))}
        </section>
      )}

      {activeTab === 'strategies' ? (
        <StrategiesView symbol={symbol} timeframe={timeframe} />
      ) : activeTab === 'journal' ? (
        <TradingJournalView />
      ) : (
        <>
          {/* Main Chart Card Wrapper (Supports Fullscreen Mode) */}
          <div
            ref={chartContainerRef}
            className={`chart-fullscreen-wrapper ${isFullscreen ? 'is-fullscreen' : ''}`}
          >
            {/* Main Control Toolbar */}
            <section className="chart-unified-toolbar">
              <div className="toolbar-left-group">
                <div className="timeframe-pills" role="group" aria-label="Timeframe selector">
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
                      onClick={() => setTimeframe(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                <div className="toolbar-divider" />

                {/* Indicator Controls Dropdown */}
                <IndicatorMenu
                  indicators={indicators}
                  onToggle={handleIndicatorToggle}
                />
              </div>

              <div className="toolbar-right-group">
                {/* Chart Engine Switcher */}
                <div className="engine-switcher-pills" role="group" aria-label="Chart renderer">
                  <button
                    type="button"
                    className={chartEngine === 'lightweight' ? 'active' : ''}
                    onClick={() => setChartEngineMode('lightweight')}
                    title="Lightweight Charts v5 (Native High-Speed)"
                  >
                    <span>⚡ Lightweight</span>
                  </button>
                  <button
                    type="button"
                    className={chartEngine === 'tradingview' ? 'active' : ''}
                    onClick={() => setChartEngineMode('tradingview')}
                    title="TradingView Advanced Widget"
                  >
                    <span>📊 TradingView</span>
                  </button>
                </div>

                <button
                  type="button"
                  className="analyze-pipeline-btn"
                  onClick={analyze}
                  disabled={loading}
                >
                  {loading ? 'Analyzing…' : '↻ Analyze'}
                </button>

                <button
                  type="button"
                  className={`fullscreen-btn ${isFullscreen ? 'active' : ''}`}
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Full Screen View'}
                  aria-label="Toggle Fullscreen"
                >
                  <span>{isFullscreen ? '🗗 Exit' : '⛶ Fullscreen'}</span>
                </button>
              </div>
            </section>

            {/* Chart Frame Section */}
            <section className="chart-viewport-card">
              {chartEngine === 'tradingview' ? (
                <TradingViewWidget
                  symbol={symbol}
                  timeframe={timeframe}
                  theme={theme}
                />
              ) : (
                <MarketChart
                  symbol={symbol}
                  timeframe={timeframe}
                  theme={theme}
                  showEMA20={indicators.showEMA20}
                  showEMA50={indicators.showEMA50}
                  showEMA200={indicators.showEMA200}
                  showSupportResistance={indicators.showSupportResistance}
                  showPatterns={indicators.showPatterns}
                  showVolume={indicators.showVolume}
                />
              )}
            </section>
          </div>

          {/* Quick Metrics Ticker */}
          <StatsTicker analysis={analysis} />

          {/* 2-Column Responsive Dashboard Grid: AI Analysis + Alerts */}
          <section className="dashboard-analysis-alerts-grid">
            <AnalysisPanel
              symbol={symbol}
              timeframe={timeframe}
              analysis={analysis}
              loading={loading}
              onRefresh={analyze}
            />

            <AlertsPanel
              symbol={symbol}
              alerts={alerts}
              currentPrice={analysis?.price}
              onToggle={toggleAlert}
              onDelete={deleteAlert}
              onCreate={createAlert}
            />
          </section>
        </>
      )}
    </main>
  );
}
