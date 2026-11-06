'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  alertNotificationSchema,
  bollingerNotificationSchema,
  receivedAlertSchema,
  alertHistoryResponseSchema,
  alertsResponseSchema,
  bollingerRunStatusesSchema,
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
import AlertManagementView, {
  type BollingerRunStatus,
  type ReceivedAlert,
} from '../components/AlertManagementView';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface AlertToast {
  id: string;
  alert_id?: string;
  symbol: string;
  message: string;
  fired_at?: string;
  condition_type?: string;
}

interface BollingerToast {
  event_id: string;
  kind: 'alert' | 'signal' | 'breakout';
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
  const [bollingerNotifications, setBollingerNotifications] = useState<BollingerToast[]>([]);
  const [receivedAlerts, setReceivedAlerts] = useState<ReceivedAlert[]>([]);
  const receivedAlertsRef = useRef<ReceivedAlert[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [bollingerStatuses, setBollingerStatuses] = useState<Record<string, BollingerRunStatus>>({
    BTCUSDT: 'running',
    XAUUSD: 'running',
  });
  const [alertControlError, setAlertControlError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundVolume, setSoundVolume] = useState(80);
  const soundVolumeRef = useRef(80);
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenBollingerEvents = useRef<Set<string>>(new Set());
  const candleNotificationsEnabled = false;
  const [telegramSendingId, setTelegramSendingId] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [chartEngine, setChartEngine] = useState<'lightweight' | 'tradingview'>('lightweight');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const recordReceivedAlerts = useCallback((notifications: ReceivedAlert[]) => {
    const byId = new Map(receivedAlertsRef.current.map((alert) => [alert.id, alert]));
    for (const notification of notifications) byId.set(notification.id, notification);
    const next = [...byId.values()]
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
    receivedAlertsRef.current = next;
    setReceivedAlerts(next);
    try {
      localStorage.setItem('received-alert-history', JSON.stringify(next));
      setHistoryError(null);
    } catch (error) {
      console.error('Failed to save received alert history:', error);
      setHistoryError('Could not save alert history in this browser. Check available storage.');
    }
  }, []);
  const recordReceivedAlert = useCallback(
    (notification: ReceivedAlert) => recordReceivedAlerts([notification]),
    [recordReceivedAlerts],
  );

  const playAlertSound = useCallback((frequency: number) => {
    const context = audioContextRef.current;
    const volume = soundVolumeRef.current / 100;
    if (!soundEnabledRef.current || !context || volume <= 0) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.75 * volume, now + 0.03);
    gain.gain.setValueAtTime(0.75 * volume, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const savedVolume = Number(localStorage.getItem('alert-sound-volume'));
    if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 100) {
      setSoundVolume(savedVolume);
      soundVolumeRef.current = savedVolume;
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('received-alert-history');
      const parsed = saved ? JSON.parse(saved) : [];
      const validated = Array.isArray(parsed)
        ? parsed.map((item) => receivedAlertSchema.safeParse(item))
          .filter((result) => result.success)
          .map((result) => result.data)
        : [];
      receivedAlertsRef.current = validated;
      setReceivedAlerts(validated);
    } catch (error) {
      console.error('Failed to load received alert history:', error);
      setHistoryError('Could not load saved alert history from this browser.');
    }
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

  const handleLiveCandle = useCallback((candle: { close: number }) => {
    setAnalysis((current) => current ? { ...current, price: candle.close } : current);
  }, []);

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
    showBollingerBands: true,
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
      const savedBollinger = localStorage.getItem('chart-show-bollinger');
      const savedSR = localStorage.getItem('chart-show-support-resistance');
      const savedPatterns = localStorage.getItem('chart-show-patterns');
      const savedVolume = localStorage.getItem('chart-show-volume');

      setIndicators({
        showEMA20: savedEMA20 !== null ? JSON.parse(savedEMA20) : true,
        showEMA50: savedEMA50 !== null ? JSON.parse(savedEMA50) : true,
        showEMA200: savedEMA200 !== null ? JSON.parse(savedEMA200) : true,
        showBollingerBands: savedBollinger !== null ? JSON.parse(savedBollinger) : true,
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
        showBollingerBands: 'chart-show-bollinger',
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

  const refreshChart = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
    await fetchAnalysis();
    setRefreshing(false);
  }, [fetchAnalysis]);

  // Fetch alerts list
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/alerts`);
      if (response.ok) {
        const parsed = alertsResponseSchema.safeParse(await response.json());
        if (parsed.success) setAlerts(parsed.data.alerts);
        else {
          console.error('Alert list response did not match the expected schema:', parsed.error);
          setAlertControlError('The backend returned invalid alert configuration data.');
        }
      } else {
        setAlertControlError('Could not load configured alerts from the backend.');
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      setAlertControlError('Could not reach the backend to load configured alerts.');
    }
  }, []);

  useEffect(() => {
    fetchAnalysis();
    fetchAlerts();
  }, [fetchAnalysis, fetchAlerts]);

  useEffect(() => {
    let active = true;
    const loadBollingerStatuses = async () => {
      const [statusResult, historyResult] = await Promise.allSettled([
        fetch(`${API}/api/strategies/bollinger/status`),
        fetch(`${API}/api/alerts/history/all?limit=500`),
      ]);
      if (!active) return;

      if (statusResult.status === 'fulfilled' && statusResult.value.ok) {
        const parsed = bollingerRunStatusesSchema.safeParse(await statusResult.value.json());
        if (parsed.success) setBollingerStatuses(parsed.data.statuses);
        else {
          console.error('Bollinger status response did not match the expected schema:', parsed.error);
          setAlertControlError('The backend returned invalid Bollinger alert status data.');
        }
      } else {
        const error = statusResult.status === 'rejected' ? statusResult.reason : statusResult.value.statusText;
        console.error('Failed to load Bollinger alert statuses:', error);
        setAlertControlError('Could not load Bollinger alert status from the backend.');
      }

      if (historyResult.status === 'fulfilled' && historyResult.value.ok) {
        const parsed = alertHistoryResponseSchema.safeParse(await historyResult.value.json());
        if (parsed.success) {
          recordReceivedAlerts(parsed.data.history.map((item) => ({
              id: `rule:${item.alert_id}:${item.fired_at}`,
              source: 'rule',
              kind: item.condition_type,
              symbol: item.symbol,
              message: `${item.condition_type} crossed ${item.direction} ${item.condition_value} (trigger ${item.trigger_value})`,
              receivedAt: item.fired_at,
            })));
          setHistoryError(null);
        } else {
          console.error('Alert history response did not match the expected schema:', parsed.error);
          setHistoryError('The backend returned invalid alert history data.');
        }
      } else {
        const error = historyResult.status === 'rejected' ? historyResult.reason : historyResult.value.statusText;
        console.error('Failed to load server alert history:', error);
        setHistoryError('Could not load server alert history. New alerts will still be saved in this browser.');
      }
    };
    void loadBollingerStatuses().catch((error) => {
      console.error('Failed to load alert management data:', error);
      if (active) setAlertControlError('Could not load alert management data from the backend.');
    });
    return () => { active = false; };
  }, [recordReceivedAlerts]);

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
          const bollinger = bollingerNotificationSchema.safeParse(data);
          if (bollinger.success) {
            const event = bollinger.data;
            if (seenBollingerEvents.current.has(event.event_id)) return;
            seenBollingerEvents.current.add(event.event_id);
            const notification = {
              event_id: event.event_id,
              kind: event.kind,
              symbol: event.data.symbol,
              message: event.message,
            };
            setBollingerNotifications((prev) => [notification, ...prev]);
            recordReceivedAlert({
              id: event.event_id,
              source: 'bollinger',
              kind: event.kind,
              symbol: event.data.symbol,
              timeframe: event.data.timeframe,
              message: event.message,
              receivedAt: new Date().toISOString(),
            });
            playAlertSound(event.kind === 'signal' ? 880 : 660);
          } else {
            const parsed = alertNotificationSchema.safeParse(data);
            if (parsed.success) {
              const notification: AlertToast = {
                ...parsed.data.data,
                id: `${parsed.data.data.alert_id ?? parsed.data.data.symbol}-${parsed.data.data.fired_at ?? Date.now()}`,
              };
              setAlertNotifications((prev) => [...prev, notification]);
              recordReceivedAlert({
                id: notification.alert_id && notification.fired_at
                  ? `rule:${notification.alert_id}:${notification.fired_at}`
                  : `rule:${notification.id}`,
                source: 'rule',
                kind: notification.condition_type ?? 'price/indicator',
                symbol: notification.symbol,
                message: notification.message,
                receivedAt: notification.fired_at ?? new Date().toISOString(),
              });
              playAlertSound(760);
            }
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
  }, [playAlertSound, recordReceivedAlert]);

  const enableAlertSound = async () => {
    if (soundEnabled) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      toast.dismiss('alert-sound-status');
      return;
    }
    try {
      const context = audioContextRef.current ?? new AudioContext();
      await context.resume();
      audioContextRef.current = context;
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      toast.info('Alert sound enabled', { toastId: 'alert-sound-status', autoClose: false });
    } catch {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      toast.error('Alert sound could not be enabled in this browser.');
    }
  };

  const changeSoundVolume = (value: number) => {
    setSoundVolume(value);
    soundVolumeRef.current = value;
    try {
      localStorage.setItem('alert-sound-volume', String(value));
    } catch (error) {
      console.error('Failed to save alert sound volume:', error);
    }
  };

  const dismissBollingerNotification = (eventId: string) => {
    setBollingerNotifications((prev) => prev.filter((notification) => notification.event_id !== eventId));
  };

  const dismissAlertNotification = (id: string) => {
    setAlertNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

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
      setAlertControlError(null);
      const response = await fetch(`${API}/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) {
        setAlerts((prev) =>
          prev.map((alert) => (alert.id === alertId ? { ...alert, enabled } : alert))
        );
      } else {
        const body = await response.json();
        setAlertControlError(body.detail || 'Could not update this alert.');
      }
    } catch (error) {
      console.error('Failed to toggle alert:', error);
      setAlertControlError('Could not reach the backend to update this alert.');
    }
  }

  async function setBollingerStatus(instrument: string, status: BollingerRunStatus) {
    try {
      setAlertControlError(null);
      const response = await fetch(`${API}/api/strategies/bollinger/status/${instrument}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Could not update Bollinger alerts.');
      setBollingerStatuses((previous) => ({ ...previous, [body.symbol]: body.status }));
    } catch (error) {
      console.error('Failed to update Bollinger alert status:', error);
      setAlertControlError(error instanceof Error ? error.message : 'Could not update Bollinger alerts.');
    }
  }

  async function deleteAlert(alertId: string) {
    try {
      setAlertControlError(null);
      const response = await fetch(`${API}/api/alerts/${alertId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      } else {
        const body = await response.json();
        setAlertControlError(body.detail || 'Could not stop this alert.');
      }
    } catch (error) {
      console.error('Failed to delete alert:', error);
      setAlertControlError('Could not reach the backend to stop this alert.');
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
      alertCount={alerts.filter((alert) => alert.enabled).length
        + Object.values(bollingerStatuses).filter((status) => status === 'running').length}
    >
      {/* Floating Alert Notifications */}
      {bollingerNotifications.length > 0 && (
        <section className="alert-notifications">
          {bollingerNotifications.map((notification) => (
            <div key={notification.event_id} className="alert-notification bollinger-notification">
              <span className="notification-icon" aria-hidden="true">BB</span>
              <div><strong>{notification.kind.toUpperCase()} · {notification.symbol}</strong><br />{notification.message}</div>
              <button type="button" className="notification-dismiss" aria-label="Dismiss Bollinger alert" onClick={() => dismissBollingerNotification(notification.event_id)}>×</button>
            </div>
          ))}
        </section>
      )}
      {alertNotifications.length > 0 && (
        <section className="alert-notifications">
          {alertNotifications.map((notification) => (
            <div key={notification.id} className="alert-notification">
              <span className="notification-icon" aria-hidden="true">!</span>
              <strong>{notification.symbol}</strong>: {notification.message}
              <button type="button" className="notification-dismiss" aria-label="Dismiss alert" onClick={() => dismissAlertNotification(notification.id)}>×</button>
            </div>
          ))}
        </section>
      )}

      {telegramStatus && (
        <section className="alert-notifications">
          <div className="alert-notification" role="status">
            <span>{telegramStatus}</span>
            <button type="button" className="notification-dismiss" aria-label="Dismiss Telegram status" onClick={() => setTelegramStatus(null)}>×</button>
          </div>
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
          onLiveCandle={handleLiveCandle}
          onRefreshChart={refreshChart}
          refreshing={refreshing}
          refreshKey={refreshKey}
          onRefreshAnalysis={fetchAnalysis}
          onCreateAlert={createAlert}
          onToggleAlert={toggleAlert}
          onDeleteAlert={deleteAlert}
        />
      )}

      {activeTab === 'strategies' && <StrategiesView symbol={symbol} timeframe={timeframe} />}

      {activeTab === 'testing' && <TestingView />}

      {activeTab === 'journal' && <TradingJournalView />}

      {activeTab === 'alerts' && (
        <AlertManagementView
          alerts={alerts}
          receivedAlerts={receivedAlerts}
          bollingerStatuses={bollingerStatuses}
          soundEnabled={soundEnabled}
          soundVolume={soundVolume}
          controlError={alertControlError ?? historyError}
          onSetBollingerStatus={setBollingerStatus}
          onToggleAlert={toggleAlert}
          onStopAlert={deleteAlert}
          onToggleSound={enableAlertSound}
          onSoundVolumeChange={changeSoundVolume}
        />
      )}
    </AppShell>
  );
}
