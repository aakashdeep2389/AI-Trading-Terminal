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
import TestingView from '../components/TestingView';
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
  const [activeTab, setActiveTab] = useState<'chart' | 'strategies' | 'testing' | 'journal'>('chart');
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
    } catch (e) {
      console.error('Failed to load indicator preferences:', e);
    }
  }, []);

  const updateIndicator = (key: keyof IndicatorStates, val: boolean) => {
    const next = { ...indicators, [key]: val };
    setIndicators(next);
    try {
      const map: Record<keyof IndicatorStates, string> = {
        showEMA20: 'chart-show-ema-20',
        showEMA50: 'chart-show-ema-50',
        showEMA200: 'chart-show-ema-200',
        showSupportResistance: 'chart-show-support-resistance',
        showPatterns: 'chart-show-patterns',
        showVolume: 'chart-show-volume',
      };
      localStorage.setItem(map[key], JSON.stringify(val));
    } catch (e) {
      console.error('Failed to save indicator preference:', e);
    }
  };

  // Fetch analysis data
  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/analysis/${symbol}?timeframe=${timeframe}`);
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
      }
    } catch (error) {
      console.error('Failed to fetch analysis:', error);
    }
    setLoading(false);
  }, [symbol, timeframe]);

  // Fetch alerts list
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/alerts?symbol=${symbol}`);
      if (response.ok) {
        const data = await response.json();
        setAlerts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, [symbol]);

  useEffect(() => {
    fetchAnalysis();
    fetchAlerts();
  }, [fetchAnalysis, fetchAlerts]);

  // WebSocket for alert notifications
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host.includes('localhost') ? 'localhost:8000' : window.location.host}/api/ws/alerts`;
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const parsed = alertNotificationSchema.safeParse(data);
          if (parsed.success) {
            setAlertNotifications((prev) => [...prev, parsed.data]);
            setTimeout(() => {
              setAlertNotifications((prev) => prev.filter((n) => n !== parsed.data));
            }, 6000);
          }
        } catch (e) {
          console.error('Failed to parse alert notification WS message:', e);
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  async function createAlert(input: AlertFormInput) {
    try {
      const response = await fetch(`${API}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (response.ok) {
        await fetchAlerts();
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
            aria-selected={activeTab === 'testing'}
            className={`nav-tab-btn ${activeTab === 'testing' ? 'active' : ''}`}
            onClick={() => setActiveTab('testing')}
          >
            <span className="tab-icon">🧪</span>
            <span>Testing & Paper Run</span>
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

      {/* Dynamic Tab Views */}
      {activeTab === 'chart' && (
        <div className="terminal-dashboard">
          {/* Top Ticker Stats */}
          <StatsTicker symbol={symbol} timeframe={timeframe} />

          {/* Main Workspace Grid */}
          <div className="dashboard-grid">
            {/* Left: Chart & Indicators */}
            <div className="workspace-column chart-column">
              <div className="panel chart-panel" ref={chartContainerRef}>
                <div className="chart-toolbar">
                  <div className="pills timeframe-pills">
                    {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        className={timeframe === tf ? 'active' : ''}
                        onClick={() => setTimeframe(tf)}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>

                  <div className="chart-toolbar-right">
                    <IndicatorMenu indicators={indicators} onChange={updateIndicator} />
                    <div className="pills engine-pills">
                      <button
                        type="button"
                        className={chartEngine === 'lightweight' ? 'active' : ''}
                        onClick={() => setChartEngineMode('lightweight')}
                      >
                        Canvas
                      </button>
                      <button
                        type="button"
                        className={chartEngine === 'tradingview' ? 'active' : ''}
                        onClick={() => setChartEngineMode('tradingview')}
                      >
                        TradingView
                      </button>
                    </div>

                    <button
                      type="button"
                      className="chart-action-btn"
                      onClick={toggleFullscreen}
                      title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                      aria-label="Toggle fullscreen"
                    >
                      {isFullscreen ? '⤹' : '⤢'}
                    </button>
                  </div>
                </div>

                <div className="chart-wrapper">
                  {chartEngine === 'lightweight' ? (
                    <MarketChart symbol={symbol} timeframe={timeframe} indicators={indicators} theme={theme} />
                  ) : (
                    <TradingViewWidget symbol={symbol} theme={theme} />
                  )}
                </div>
              </div>
            </div>

            {/* Right: AI Analysis & Alerts Sidebar */}
            <div className="workspace-column sidebar-column">
              <AnalysisPanel symbol={symbol} timeframe={timeframe} analysis={analysis} loading={loading} />
              <AlertsPanel symbol={symbol} alerts={alerts} onCreate={createAlert} onToggle={toggleAlert} onDelete={deleteAlert} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'strategies' && <StrategiesView />}

      {activeTab === 'testing' && <TestingView />}

      {activeTab === 'journal' && <TradingJournalView />}
    </main>
  );
}
