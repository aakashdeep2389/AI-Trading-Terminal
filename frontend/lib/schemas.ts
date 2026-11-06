import { z } from 'zod';

/**
 * Frontend validation layer (AGENT_RULES rule 8): external input crossing the
 * API and WebSocket boundary is validated with Zod before it is rendered.
 * Python remains the numerical source of truth; these schemas only guard the
 * client against malformed/unknown payloads.
 */

// ---- Alert realtime WebSocket payloads ----
export const alertNotificationSchema = z.object({
  type: z.literal('alert'),
  data: z.object({
    alert_id: z.string().optional(),
    symbol: z.string(),
    message: z.string(),
    fired_at: z.string().optional(),
    condition_type: z.string().optional(),
    trigger_value: z.number().optional(),
    condition_value: z.number().optional(),
    direction: z.string().optional(),
  }),
});

export const bollingerNotificationSchema = z.object({
  type: z.literal('bollinger'),
  event_id: z.string(),
  kind: z.enum(['alert', 'signal', 'breakout']),
  data: z.object({
    symbol: z.string(),
    timeframe: z.string(),
    timestamp: z.number(),
  }).passthrough(),
  message: z.string(),
});

export type BollingerNotification = z.infer<typeof bollingerNotificationSchema>;

export const receivedAlertSchema = z.object({
  id: z.string(),
  source: z.enum(['bollinger', 'rule']),
  kind: z.string(),
  symbol: z.string(),
  timeframe: z.string().optional(),
  message: z.string(),
  receivedAt: z.string(),
});

export const bollingerRunStatusesSchema = z.object({
  statuses: z.record(z.enum(['BTCUSDT', 'XAUUSD']), z.enum(['running', 'paused', 'stopped'])),
});

export const alertHistoryResponseSchema = z.object({
  history: z.array(z.object({
    id: z.number(),
    alert_id: z.string(),
    symbol: z.string(),
    condition_type: z.string(),
    direction: z.string(),
    condition_value: z.number(),
    trigger_value: z.number(),
    fired_at: z.string(),
  }).passthrough()),
});

// ---- Alerts CRUD / list ----
export const alertSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  condition_type: z.string(),
  condition_value: z.number(),
  direction: z.string(),
  timeframe: z.string(),
  enabled: z.boolean(),
  notification_channels: z.array(z.string()),
  created_at: z.string(),
  fired_count: z.number(),
  last_fired_at: z.string().nullable().optional(),
});

export type Alert = z.infer<typeof alertSchema>;
export const alertsResponseSchema = z.object({ alerts: z.array(alertSchema) });

// ---- Alert creation form input (validated before POST) ----
export const alertFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  condition_type: z.enum(['price', 'rsi', 'macd_signal']),
  condition_value: z.number(),
  direction: z.enum(['up', 'down']),
  timeframe: z.string(),
  notification_channels: z.array(z.string()).default(['browser']),
});

export type AlertFormInput = z.infer<typeof alertFormSchema>;

// ---- Analysis response from /api/analysis/{symbol} ----
// Fields are optional because individual sections can be absent; extras are
// tolerated so a forward-additive backend never breaks the client.
const riskSchema = z.object({
  verdict: z.string().optional(),
  direction: z.string().optional(),
  entry: z.number().optional(),
  stop_loss: z.number().optional(),
  target: z.number().optional(),
  target_price: z.number().optional(),
  risk_reward: z.number().optional(),
  risk_pct: z.number().optional(),
  stop_distance: z.number().optional(),
  reason: z.string().optional(),
});

const indicatorsSchema = z.object({
  rsi14: z.number().optional(),
  atr14: z.number().optional(),
  ema20: z.number().optional(),
  ema50: z.number().optional(),
  ema200: z.number().optional(),
  change24h_pct: z.number().optional(),
  volume_ratio: z.number().optional(),
  trend: z.string().optional(),
  trend_reason: z.string().optional(),
});

export const analysisSchema = z
  .object({
    symbol: z.string().optional(),
    price: z.number().optional(),
    indicators: indicatorsSchema.optional(),
    risk: riskSchema.optional(),
    patterns: z.array(z.object({ name: z.string() })).optional(),
  })
  .passthrough();

export type Analysis = z.infer<typeof analysisSchema>;