'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesDefinition,
  type SeriesType,
  type DeepPartial,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
  type UTCTimestamp,
  type SeriesMarker,
  type CandlestickSeriesOptions,
  type LineSeriesOptions,
  type HistogramSeriesOptions,
} from 'lightweight-charts';
import type { IndicatorStates } from './IndicatorMenu';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

interface MarketChartProps {
  symbol: string;
  timeframe: string;
  theme: 'dark' | 'light';
  showEMA20?: boolean;
  showEMA50?: boolean;
  showEMA200?: boolean;
  showSupportResistance?: boolean;
  showPatterns?: boolean;
  showVolume?: boolean;
  indicators?: IndicatorStates;
  onCandleClosed?: (event: CandleCloseEvent) => void;
  onLiveCandle?: (candle: StreamCandle) => void;
  refreshKey?: number;
}

interface BackendSeries {
  type: SeriesType;
  kind?: 'SRLine' | 'BollingerUpper' | 'BollingerMiddle' | 'BollingerLower';
  data?: unknown[];
  options?: Record<string, unknown>;
  priceScale?: Record<string, unknown>;
  markers?: SeriesMarker<Time>[];
}

/** A "bar" arriving over the live WebSocket stream. */
interface StreamCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bollinger?: {
    upper: number;
    middle: number;
    lower: number;
  };
}

interface CandleCloseEvent {
  type?: string;
  symbol?: string;
  timeframe?: string;
  data?: StreamCandle;
}

/**
 * Lightweight Charts v5 candlestick chart.
 *
 * Python (the backend /api/chart/config endpoint) computes every number —
 * candles, EMAs, volume, pattern markers, S/R levels — and returns a render
 * config. This component only draws it. Live WebSocket candle updates are
 * applied incrementally with series.update(), never by re-fetching the whole
 * history, so the chart stays smooth while the stream is running.
 */
export default function MarketChart({
  symbol,
  timeframe,
  theme,
  showEMA20,
  showEMA50,
  showEMA200,
  showSupportResistance,
  showPatterns,
  showVolume,
  indicators,
  onCandleClosed,
  onLiveCandle,
  refreshKey = 0,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{ series: ISeriesApi<SeriesType>; type: BackendSeries['type']; kind?: string }[]>([]);
  const lastCandleTimeRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null);

  const effEMA20 = indicators?.showEMA20 ?? showEMA20 ?? true;
  const effEMA50 = indicators?.showEMA50 ?? showEMA50 ?? true;
  const effEMA200 = indicators?.showEMA200 ?? showEMA200 ?? true;
  const effBollingerBands = indicators?.showBollingerBands ?? true;
  const effSR = indicators?.showSupportResistance ?? showSupportResistance ?? true;
  const effPatterns = indicators?.showPatterns ?? showPatterns ?? true;
  const effVolume = indicators?.showVolume ?? showVolume ?? true;

  useEffect(() => {
    const step = TIMEFRAME_SECONDS[timeframe];
    if (!step) {
      setSecondsToClose(null);
      return;
    }
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now % step;
      setSecondsToClose(step - elapsed);
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [timeframe]);

  const fetchConfig = useCallback(async () => {
    const params = new URLSearchParams({
      symbol,
      timeframe,
      chart_type: 'candlestick',
      show_emas_20: String(effEMA20),
      show_emas_50: String(effEMA50),
      show_emas_200: String(effEMA200),
      show_volume: String(effVolume),
      show_patterns: String(effPatterns),
      show_support_resistance: String(effSR),
      refresh: 'true',
      theme,
    });
    try {
      const response = await fetch(`${API}/api/chart/config?${params}`);
      if (!response.ok) throw new Error(`chart/config ${response.status}`);
      const body = await response.json();
      return body?.config?.[0] ?? null;
    } catch (error) {
      console.error('[MarketChart] failed to load config:', error);
      return null;
    }
  }, [symbol, timeframe, effEMA20, effEMA50, effEMA200, effVolume, effPatterns, effSR, theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let ws: WebSocket | null = null;

    async function mount() {
      const host = containerRef.current;
      if (!host || disposed) return;

      const config = await fetchConfig();
      if (disposed) return;
      if (!config) {
        setError('Live historical market data is unavailable. Configure a market-data provider to load this chart.');
        return;
      }
      setError(null);

      // 2. Create the chart.
      await new Promise(resolve => requestAnimationFrame(resolve));
      const chart = createChart(host, {
        autoSize: true,
        ...(config.chart ?? {}),
      });
      if (disposed) {
        chart.remove();
        return;
      }
      chartRef.current = chart;

      // 3. Add each series from the backend config.
      const alive: typeof seriesRef.current = [];

      for (const s of config.series ?? []) {
        let definition: SeriesDefinition<SeriesType> | null = null;
        let series: ISeriesApi<SeriesType> | null = null;

        // Skip series types that are toggled off.
        if (s.type === 'Histogram' && !showVolume) continue;
        if (s.type === 'Line' && s.kind === 'SRLine' && !showSupportResistance) continue;
        if (s.kind?.startsWith('Bollinger') && !effBollingerBands) continue;

        if (s.type === 'Candlestick') {
          definition = CandlestickSeries;
          series = chart.addSeries(definition, s.options as DeepPartial<CandlestickSeriesOptions>);
          if (s.data?.length) series.setData(s.data as CandlestickData<Time>[]);
          if (showPatterns && s.markers?.length) createSeriesMarkers(series, s.markers as SeriesMarker<Time>[]);
        } else if (s.type === 'Line') {
          const lineKind = (s as BackendSeries & { kind?: string }).kind;
          const isSRLine = lineKind === 'SRLine';
          const isEMALine = !isSRLine;

          if (isSRLine && !showSupportResistance) continue;
          if (isEMALine) {
            const color = (s.options as unknown as LineSeriesOptions)?.color;
            if (color === '#2196F3' && !showEMA20) continue;
            if (color === '#FF9800' && !showEMA50) continue;
            if (color === '#9C27B0' && !showEMA200) continue;
          }

          definition = LineSeries;
          series = chart.addSeries(definition, s.options as DeepPartial<LineSeriesOptions>);
          if (s.data?.length) series.setData(s.data as LineData<Time>[]);
        } else if (s.type === 'Histogram') {
          definition = HistogramSeries;
          series = chart.addSeries(definition, s.options as DeepPartial<HistogramSeriesOptions>);
          if (s.data?.length) series.setData(s.data as HistogramData<Time>[]);
          if (s.priceScale) series.priceScale().applyOptions(s.priceScale as never);
        }

        if (definition && series) alive.push({ series, type: s.type, kind: s.kind });
      }
      seriesRef.current = alive;
      
      const initialCandles = config.series?.find((s: BackendSeries) => s.type === 'Candlestick')?.data as Array<{ time?: number | string }> | undefined;
      if (initialCandles?.length) {
        lastCandleTimeRef.current = Number(initialCandles[initialCandles.length - 1]?.time);
      }

      chart.timeScale().scrollToRealTime();

      // 4. Live updates
      const wsUrl = API.replace(/^http/, 'ws');
      ws = new WebSocket(`${wsUrl}/api/ws/market/${symbol}?timeframe=${timeframe}`);
      ws.onopen = () => setStreamState('live');
      ws.onerror = () => setStreamState('offline');
      ws.onclose = () => setStreamState('offline');
      ws.onmessage = async (event) => {
        let message: { type?: string; data?: StreamCandle } | null = null;
        try {
          message = JSON.parse(event.data as string);
        } catch { return; }
        if (message?.type === 'candle_closed' && message.data) {
          onCandleClosed?.(message as CandleCloseEvent);
          return;
        }
        if (message?.type !== 'candle' || !message.data) return;

        const { time, open, high, low, close, volume } = message.data;
        const ts = Number(time) as UTCTimestamp;
        if (!Number.isFinite(ts)) return;

        const lastSeenTime = lastCandleTimeRef.current;

        // Ignore delayed messages so incremental updates preserve chart order.
        if (lastSeenTime !== null && ts < lastSeenTime) return;

        lastCandleTimeRef.current = Math.max(lastCandleTimeRef.current ?? ts, ts);
        setLastUpdate(Date.now());
        const candleSeries = seriesRef.current.find((a) => a.type === 'Candlestick');
        if (candleSeries) candleSeries.series.update({ time: ts, open, high, low, close });
        onLiveCandle?.(message.data);

        const volumeSeries = seriesRef.current.find((a) => a.type === 'Histogram');
        if (volumeSeries) {
          volumeSeries.series.update({
            time: ts,
            value: volume,
            color: close >= open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
          });
        }

        if (message.data.bollinger) {
          for (const [kind, value] of Object.entries({
            BollingerUpper: message.data.bollinger.upper,
            BollingerMiddle: message.data.bollinger.middle,
            BollingerLower: message.data.bollinger.lower,
          })) {
            const bandSeries = seriesRef.current.find((item) => item.kind === kind);
            if (bandSeries && Number.isFinite(value)) {
              bandSeries.series.update({ time: ts, value });
            }
          }
        }
      };
    }
    mount();
    return () => {
      disposed = true;
      ws?.close();
      chartRef.current?.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchConfig, symbol, timeframe, refreshKey, effBollingerBands]);

  return (
    <div className="market-chart" ref={containerRef} aria-label={`${symbol} ${timeframe} chart`}>
      <div className={`market-chart-stream-status ${streamState}`} role="status">
        <span className="market-chart-stream-dot" aria-hidden="true" />
        {streamState === 'live' ? 'LIVE' : streamState === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
        {lastUpdate && streamState === 'live' ? ` · updated ${new Date(lastUpdate).toLocaleTimeString()}` : ''}
        {secondsToClose !== null && (
          <span className="market-chart-countdown" aria-label={`Bar closes in ${secondsToClose} seconds`}>
            {Math.floor(secondsToClose / 60)}:{String(secondsToClose % 60).padStart(2, '0')}
          </span>
        )}
      </div>
      {error && <div role="status" className="market-chart-error">{error}</div>}
    </div>
  );
}
