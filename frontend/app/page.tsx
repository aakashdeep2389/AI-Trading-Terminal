'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  alertNotificationSchema,
  type Alert,
  type AlertFormInput,
  type Analysis,
} from '../lib/schemas';
import StrategiesView from '../components/StrategiesView';
import TradingJournalView from '../components/TradingJournalView';
import TestingView from '../components/TestingView';
import { type IndicatorStates } from '../components/IndicatorMenu';
import AppShell, { type WorkspaceTab } from '../components/AppShell';
import DashboardView from '../components/DashboardView';
import TradingTerminalView from '../components/TradingTerminalView';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface AlertToast {
  alert_id?: string;
  symbol: string;
  message: string;
}

interface CandleCloseToast {
  id: string;
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export default function Home() {
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('15m');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertNotifications, setAlertNotifications] = useState<AlertToast[]>([]);
  const candleNotificationsEnabled = false;
  const [telegramSendingId, setTelegramSendingId] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [chartEngine, setChartEngine] = useState<'lightweight' | 'tradingview'>('lightweight');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleCandleClosed = useCallback((event: { symbol?: string; timeframe?: string; data?: Omit<CandleCloseToast, 'id' | 'symbol' | 'timeframe'> }) => {
    if (!candleNotificationsEnabled || !event.data || !event.symbol || !event.timeframe) return;
    const notification: CandleCloseToast = {
      id: `${event.symbol}-${event.timeframe}-${event.data.time}`,
      symbol: event.symbol,
      timeframe: event.timeframe,
      ...event.data,
    };
    toast(
      <div className="candle-toast">
        <div>
          🕯️ <strong>{notification.symbol} {notification.timeframe}</strong> candle closed — close {notification.close}
        </div>
        <button
          type="button"
          onClick={() => sendCandleToTelegram(notification)}
          disabled={telegramSendingId === notification.id}
        >
          {telegramSendingId === notification.id ? 'Sending…' : 'Send Telegram'}
        </button>
      </div>,
      { toastId: notification.id }
    );
  }, [candleNotificationsEnabled, telegramSendingId]);

  const sendCandleToTelegram = async (candle: CandleCloseToast) => {
    setTelegramSendingId(candle.id);
    setTelegramStatus(null);
    try {
      const response = await fetch(`${API}/api/telegram/candle-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candle),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Telegram notification failed');
      setTelegramStatus(`${candle.symbol} ${candle.timeframe} notification sent.`);
    } catch (error) {
      setTelegramStatus(error instanceof Error ? error.message : 'Telegram notification failed');
    } finally {
      setTelegramSendingId(null);
    }
  };

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
            const toast: AlertToast = parsed.data.data;
            setAlertNotifications((prev) => [...prev, toast]);
            setTimeout(() => {
              setAlertNotifications((prev) => prev.filter((n) => n !== toast));
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
    <AppShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      symbol={symbol}
      timeframe={timeframe}
      theme={theme}
      onToggleTheme={() => setThemeMode(theme === 'dark' ? 'light' : 'dark')}
      alertCount={alerts.filter((alert) => alert.enabled).length}
    >
      {/* Floating Alert Notifications */}
      {alertNotifications.length > 0 && (
        <section className="alert-notifications">
          {alertNotifications.map((notification, index) => (
            <div key={index} className="alert-notification">
              <span className="notification-icon" aria-hidden="true">!</span>
              <strong>{notification.symbol}</strong>: {notification.message}
            </div>
          ))}
        </section>
      )}

      {telegramStatus && (
        <section className="alert-notifications">
          <div className="alert-notification">{telegramStatus}</div>
        </section>
      )}

      {/* Dynamic Tab Views */}
      {activeTab === 'dashboard' && (
        <DashboardView
          onOpenTerminal={(nextSymbol) => {
            setSymbol(nextSymbol);
            setActiveTab('chart');
          }}
        />
      )}

      {activeTab === 'chart' && (
        <TradingTerminalView
          symbol={symbol}
          timeframe={timeframe}
          analysis={analysis}
          loading={loading}
          alerts={alerts}
          indicators={indicators}
          theme={theme}
          chartEngine={chartEngine}
          isFullscreen={isFullscreen}
          chartContainerRef={chartContainerRef}
          onSymbolChange={setSymbol}
          onTimeframeChange={setTimeframe}
          onIndicatorToggle={updateIndicator}
          onChartEngineChange={setChartEngineMode}
          onToggleFullscreen={toggleFullscreen}
          onCandleClosed={handleCandleClosed}
          onRefreshAnalysis={fetchAnalysis}
          onCreateAlert={createAlert}
          onToggleAlert={toggleAlert}
          onDeleteAlert={deleteAlert}
        />
      )}

      {activeTab === 'strategies' && <StrategiesView symbol={symbol} timeframe={timeframe} />}

      {activeTab === 'testing' && <TestingView />}

      {activeTab === 'journal' && <TradingJournalView />}
    </AppShell>
  );
}
