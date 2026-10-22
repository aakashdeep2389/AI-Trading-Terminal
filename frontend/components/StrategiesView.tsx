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

export interface UniversalExitConfig {
  description?: string;
  conditions: string[];
}

export interface OvernightProtectionConfig {
  description?: string;
}

export interface PriceExecutionConfig {
  initial_price: 'Market' | 'Limit';
  increase_by: string;
  timeout: string;
  final_action: 'Execute at Market Price' | 'No - Follow Price Bidding';
  follow_price_bidding: boolean;
}

export interface TradingStopLossConfig {
  activate_at: number;
  profit_increased_by: number;
  increase_tsl_by: number;
}

export interface AdvancedSettingsConfig {
  price_execution: PriceExecutionConfig;
  trading_stop_loss: TradingStopLossConfig;
  tranch_size: '100%' | '50%' | '25%';
  execute_first: 'once' | 'every N seconds/minutes';
  reactivate_on_exit_after: string;
  check_conditions_every: 'continuously' | 'on each tick';
  capital_required: number;
  take_trades: 'Start condition after exchange open' | 'Last condition before exchange close';
  user_needed_capital_to_deploy: number;
  choose_expiry: { hours: number; minutes: number };
  dont_rollover: string;
}

export interface MarketplaceSettingsConfig {
  public_strategy: boolean;
  fee_type: 'Percentage' | 'Fixed';
  min_monthly_fixed_fee: number;
  max_multiple_for_subscriber: number;
  frequency_for_variable_fee: 'Per Minute' | 'Per Hour' | 'Per Day' | 'Per Week' | 'Per Month';
  allow_others_to_duplicate_strategy: boolean;
  reciprocate_did_positions_for_new_subscriber: boolean;
  confirm_each_subscriber_manually: boolean;
  show_live_trades: boolean;
  min_monthly_fixed_fee_variable: number;
  frequency_for_variable_fee_variable: 'Per Minute' | 'Per Hour' | 'Per Day' | 'Per Week' | 'Per Month';
  max_multiple_for_subscriber_variable: number;
}

export type IndicatorParams = Record<string, string | number | boolean>;

export interface IndicatorConfig {
  type: string;
  params: IndicatorParams;
}

export interface StrategyConfig {
  name: string;
  fast: number;
  slow: number;
  risk_pct: number;
  stop_atr_multiple: number;
  rsi_buy_below: number | null;
  price_above_ema: number | null;
  custom_indicators?: IndicatorConfig[];
  universal_exit: UniversalExitConfig;
  overnight_protection: OvernightProtectionConfig;
  advanced_settings: AdvancedSettingsConfig;
  marketplace_settings: MarketplaceSettingsConfig;
}

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettingsConfig = {
  price_execution: {
    initial_price: 'Market',
    increase_by: '1 Tick',
    timeout: '0 Second',
    final_action: 'Execute at Market Price',
    follow_price_bidding: false,
  },
  trading_stop_loss: {
    activate_at: 0.0,
    profit_increased_by: 0.0,
    increase_tsl_by: 0.0,
  },
  tranch_size: '100%',
  execute_first: 'once',
  reactivate_on_exit_after: '1 second',
  check_conditions_every: 'continuously',
  capital_required: 100000,
  take_trades: 'Start condition after exchange open',
  user_needed_capital_to_deploy: 50000,
  choose_expiry: { hours: 0, minutes: 1 },
  dont_rollover: '1 minute',
};

export const DEFAULT_MARKETPLACE_SETTINGS: MarketplaceSettingsConfig = {
  public_strategy: false,
  fee_type: 'Percentage',
  min_monthly_fixed_fee: 0.0,
  max_multiple_for_subscriber: 100,
  frequency_for_variable_fee: 'Per Month',
  allow_others_to_duplicate_strategy: false,
  reciprocate_did_positions_for_new_subscriber: false,
  confirm_each_subscriber_manually: false,
  show_live_trades: false,
  min_monthly_fixed_fee_variable: 0.0,
  frequency_for_variable_fee_variable: 'Per Month',
  max_multiple_for_subscriber_variable: 100,
};

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
      universal_exit: { description: '', conditions: [] },
      overnight_protection: { description: '' },
      advanced_settings: DEFAULT_ADVANCED_SETTINGS,
      marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS,
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
      universal_exit: { description: 'Exit if RSI > 80', conditions: ['RSI > 80'] },
      overnight_protection: { description: 'Square off before close' },
      advanced_settings: DEFAULT_ADVANCED_SETTINGS,
      marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS,
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
      universal_exit: { description: '', conditions: [] },
      overnight_protection: { description: '' },
      advanced_settings: {
        ...DEFAULT_ADVANCED_SETTINGS,
        price_execution: {
          ...DEFAULT_ADVANCED_SETTINGS.price_execution,
          initial_price: 'Limit',
          increase_by: '2 Ticks',
          timeout: '5 Seconds',
        },
      },
      marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS,
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
      universal_exit: { description: '', conditions: [] },
      overnight_protection: { description: '' },
      advanced_settings: DEFAULT_ADVANCED_SETTINGS,
      marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS,
    },
  },
  {
    label: 'Bollinger Mean Reversion',
    config: {
      name: 'Bollinger Mean Reversion',
      fast: 20,
      slow: 50,
      risk_pct: 1.0,
      stop_atr_multiple: 2.0,
      rsi_buy_below: null,
      price_above_ema: null,
      custom_indicators: [
        { type: 'bollinger_bands', params: { period: 20, num_std: 2.0, signal: 'bounce_lower' } },
        { type: 'fibonacci_pivots', params: { lookback: 20, signal: 'above_pivot' } },
      ],
      universal_exit: { description: '', conditions: [] },
      overnight_protection: { description: '' },
      advanced_settings: DEFAULT_ADVANCED_SETTINGS,
      marketplace_settings: DEFAULT_MARKETPLACE_SETTINGS,
    },
  },
];

interface StrategiesViewProps {
  symbol?: string;
  timeframe?: string;
}

export default function StrategiesView({ symbol = 'BTCUSDT', timeframe = '1h' }: StrategiesViewProps) {
  const [strategy, setStrategy] = useState<StrategyConfig>(PRESETS[0].config);
  const [activeTab, setActiveTab] = useState<'core' | 'execution' | 'exit' | 'marketplace'>('core');
  const [newCondition, setNewCondition] = useState('');
  const [nlPrompt, setNlPrompt] = useState('buy when RSI < 30 and price is above EMA 200, use a 2 ATR stop');
  const [parsing, setParsing] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [result, setResult] = useState<BacktestStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePresetSelect = (preset: typeof PRESETS[0]) => {
    setStrategy(preset.config);
    setErrorMsg(null);
  };

  const getCustomIndicator = (type: string) => {
    return strategy.custom_indicators?.find((i) => i.type === type);
  };

  const updateCustomIndicator = (type: string, enabled: boolean, params: IndicatorParams) => {
    const existing = strategy.custom_indicators || [];
    if (!enabled) {
      setStrategy({
        ...strategy,
        custom_indicators: existing.filter((i) => i.type !== type),
      });
    } else {
      const idx = existing.findIndex((i) => i.type === type);
      if (idx >= 0) {
        const next = [...existing];
        next[idx] = { type, params };
        setStrategy({ ...strategy, custom_indicators: next });
      } else {
        setStrategy({ ...strategy, custom_indicators: [...existing, { type, params }] });
      }
    }
  };

  const bbInd = getCustomIndicator('bollinger_bands');
  const fibInd = getCustomIndicator('fibonacci_pivots');

  const handleAddCondition = () => {
    if (!newCondition.trim()) return;
    setStrategy((prev) => ({
      ...prev,
      universal_exit: {
        ...prev.universal_exit,
        conditions: [...(prev.universal_exit.conditions || []), newCondition.trim()],
      },
    }));
    setNewCondition('');
  };

  const handleRemoveCondition = (index: number) => {
    setStrategy((prev) => ({
      ...prev,
      universal_exit: {
        ...prev.universal_exit,
        conditions: prev.universal_exit.conditions.filter((_, idx) => idx !== index),
      },
    }));
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
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Parse failed: ${res.status} - ${errText}`);
      }
      const data = await res.json();
      setStrategy({
        name: data.name || 'Natural Language Strategy',
        fast: data.fast ?? 20,
        slow: data.slow ?? 50,
        risk_pct: data.risk_pct ?? 1.0,
        stop_atr_multiple: data.stop_atr_multiple ?? 2.0,
        rsi_buy_below: data.rsi_buy_below ?? null,
        price_above_ema: data.price_above_ema ?? null,
        universal_exit: data.universal_exit || { description: '', conditions: [] },
        overnight_protection: data.overnight_protection || { description: '' },
        advanced_settings: data.advanced_settings || DEFAULT_ADVANCED_SETTINGS,
        marketplace_settings: data.marketplace_settings || DEFAULT_MARKETPLACE_SETTINGS,
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
          universal_exit: strategy.universal_exit,
          overnight_protection: strategy.overnight_protection,
          advanced_settings: strategy.advanced_settings,
          marketplace_settings: strategy.marketplace_settings,
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
          <div className="title">Strategy Configuration</div>

          {/* Sub Tabs */}
          <div className="strategy-tab-nav">
            <button
              type="button"
              className={`strategy-tab-btn ${activeTab === 'core' ? 'active' : ''}`}
              onClick={() => setActiveTab('core')}
            >
              Core Signals
            </button>
            <button
              type="button"
              className={`strategy-tab-btn ${activeTab === 'execution' ? 'active' : ''}`}
              onClick={() => setActiveTab('execution')}
            >
              Execution & Risk
            </button>
            <button
              type="button"
              className={`strategy-tab-btn ${activeTab === 'exit' ? 'active' : ''}`}
              onClick={() => setActiveTab('exit')}
            >
              Exit & Protection
            </button>
            <button
              type="button"
              className={`strategy-tab-btn ${activeTab === 'marketplace' ? 'active' : ''}`}
              onClick={() => setActiveTab('marketplace')}
            >
              Marketplace
            </button>
          </div>

          {/* Tab 1: Core Signals */}
          {activeTab === 'core' && (
            <>
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

              <div className="config-section-title" style={{ marginTop: '16px' }}>Modular Indicators</div>

              {/* Bollinger Bands */}
              <div style={{ marginBottom: '14px', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={!!bbInd}
                      onChange={(e) =>
                        updateCustomIndicator('bollinger_bands', e.target.checked, {
                          period: Number(bbInd?.params?.period ?? 20),
                          num_std: Number(bbInd?.params?.num_std ?? 2.0),
                          signal: String(bbInd?.params?.signal ?? 'bounce_lower'),
                        })
                      }
                    />
                    Bollinger Bands
                  </label>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Mean Reversion & Volatility</span>
                </div>
                {bbInd && (
                  <div className="form-row" style={{ marginTop: '8px' }}>
                    <div className="form-group">
                      <label>Period</label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={Number(bbInd.params?.period ?? 20)}
                        onChange={(e) =>
                          updateCustomIndicator('bollinger_bands', true, {
                            ...bbInd.params,
                            period: parseInt(e.target.value) || 20,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Std Dev Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="5.0"
                        value={Number(bbInd.params?.num_std ?? 2.0)}
                        onChange={(e) =>
                          updateCustomIndicator('bollinger_bands', true, {
                            ...bbInd.params,
                            num_std: parseFloat(e.target.value) || 2.0,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Signal Condition</label>
                      <select
                        value={String(bbInd.params?.signal ?? 'bounce_lower')}
                        onChange={(e) =>
                          updateCustomIndicator('bollinger_bands', true, {
                            ...bbInd.params,
                            signal: e.target.value,
                          })
                        }
                      >
                        <option value="bounce_lower">Bounce Lower Band (Long)</option>
                        <option value="below_middle">Below Middle SMA</option>
                        <option value="bounce_upper">Bounce Upper Band (Short)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Fibonacci Pivots */}
              <div style={{ marginBottom: '14px', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={!!fibInd}
                      onChange={(e) =>
                        updateCustomIndicator('fibonacci_pivots', e.target.checked, {
                          lookback: Number(fibInd?.params?.lookback ?? 20),
                          signal: String(fibInd?.params?.signal ?? 'above_pivot'),
                        })
                      }
                    />
                    Daily Fibonacci Pivots
                  </label>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Dynamic Support & Resistance</span>
                </div>
                {fibInd && (
                  <div className="form-row" style={{ marginTop: '8px' }}>
                    <div className="form-group">
                      <label>Lookback Bars</label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={Number(fibInd.params?.lookback ?? 20)}
                        onChange={(e) =>
                          updateCustomIndicator('fibonacci_pivots', true, {
                            ...fibInd.params,
                            lookback: parseInt(e.target.value) || 20,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Pivot Condition</label>
                      <select
                        value={String(fibInd.params?.signal ?? 'above_pivot')}
                        onChange={(e) =>
                          updateCustomIndicator('fibonacci_pivots', true, {
                            ...fibInd.params,
                            signal: e.target.value,
                          })
                        }
                      >
                        <option value="above_pivot">Price Above Pivot</option>
                        <option value="near_support">Support (Above S1)</option>
                        <option value="below_pivot">Price Below Pivot</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tab 2: Execution & Risk */}
          {activeTab === 'execution' && (
            <>
              <div className="config-section-title">Price Execution</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Initial Price</label>
                  <select
                    value={strategy.advanced_settings.price_execution.initial_price}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          price_execution: {
                            ...strategy.advanced_settings.price_execution,
                            initial_price: e.target.value as 'Market' | 'Limit',
                          },
                        },
                      })
                    }
                  >
                    <option value="Market">Market</option>
                    <option value="Limit">Limit</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Increase By</label>
                  <input
                    type="text"
                    value={strategy.advanced_settings.price_execution.increase_by}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          price_execution: {
                            ...strategy.advanced_settings.price_execution,
                            increase_by: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Timeout</label>
                  <input
                    type="text"
                    value={strategy.advanced_settings.price_execution.timeout}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          price_execution: {
                            ...strategy.advanced_settings.price_execution,
                            timeout: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Final Action</label>
                  <select
                    value={strategy.advanced_settings.price_execution.final_action}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          price_execution: {
                            ...strategy.advanced_settings.price_execution,
                            final_action: e.target.value as 'Execute at Market Price' | 'No - Follow Price Bidding',
                          },
                        },
                      })
                    }
                  >
                    <option value="Execute at Market Price">Execute at Market Price</option>
                    <option value="No - Follow Price Bidding">No - Follow Price Bidding</option>
                  </select>
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={strategy.advanced_settings.price_execution.follow_price_bidding}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      advanced_settings: {
                        ...strategy.advanced_settings,
                        price_execution: {
                          ...strategy.advanced_settings.price_execution,
                          follow_price_bidding: e.target.checked,
                        },
                      },
                    })
                  }
                />
                Follow Price Bidding
              </label>

              <div className="config-section-title">Trailing Stop Loss (TSL)</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Activate At (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={strategy.advanced_settings.trading_stop_loss.activate_at}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          trading_stop_loss: {
                            ...strategy.advanced_settings.trading_stop_loss,
                            activate_at: parseFloat(e.target.value) || 0,
                          },
                        },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Profit Increased By (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={strategy.advanced_settings.trading_stop_loss.profit_increased_by}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          trading_stop_loss: {
                            ...strategy.advanced_settings.trading_stop_loss,
                            profit_increased_by: parseFloat(e.target.value) || 0,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Increase TSL By (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={strategy.advanced_settings.trading_stop_loss.increase_tsl_by}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      advanced_settings: {
                        ...strategy.advanced_settings,
                        trading_stop_loss: {
                          ...strategy.advanced_settings.trading_stop_loss,
                          increase_tsl_by: parseFloat(e.target.value) || 0,
                        },
                      },
                    })
                  }
                />
              </div>

              <div className="config-section-title">Execution Controls</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tranch Size</label>
                  <select
                    value={strategy.advanced_settings.tranch_size}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          tranch_size: e.target.value as '100%' | '50%' | '25%',
                        },
                      })
                    }
                  >
                    <option value="100%">100%</option>
                    <option value="50%">50%</option>
                    <option value="25%">25%</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Check Conditions</label>
                  <select
                    value={strategy.advanced_settings.check_conditions_every}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          check_conditions_every: e.target.value as 'continuously' | 'on each tick',
                        },
                      })
                    }
                  >
                    <option value="continuously">Continuously</option>
                    <option value="on each tick">On each tick</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Capital Required ($)</label>
                  <input
                    type="number"
                    value={strategy.advanced_settings.capital_required}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          capital_required: parseInt(e.target.value) || 100000,
                        },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Needed Capital To Deploy ($)</label>
                  <input
                    type="number"
                    value={strategy.advanced_settings.user_needed_capital_to_deploy}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          user_needed_capital_to_deploy: parseInt(e.target.value) || 50000,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}

          {/* Tab 3: Exit & Protection */}
          {activeTab === 'exit' && (
            <>
              <div className="config-section-title">Universal Exit</div>
              <div className="form-group">
                <label>Exit Strategy Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Close all open positions when total drawdown reaches 2% or session ends"
                  value={strategy.universal_exit.description || ''}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      universal_exit: {
                        ...strategy.universal_exit,
                        description: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>Add Exit Condition</label>
                <div className="condition-input-group">
                  <input
                    type="text"
                    placeholder="e.g. RSI > 80, PnL < -500"
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCondition();
                      }
                    }}
                  />
                  <button type="button" className="btn-inline-add" onClick={handleAddCondition}>
                    Add
                  </button>
                </div>
                {strategy.universal_exit.conditions?.length > 0 && (
                  <div className="badge-tag-list">
                    {strategy.universal_exit.conditions.map((cond, idx) => (
                      <span key={idx} className="badge-tag">
                        {cond}
                        <span
                          className="badge-tag-remove"
                          onClick={() => handleRemoveCondition(idx)}
                          title="Remove condition"
                        >
                          ✕
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="config-section-title">Overnight Protection</div>
              <div className="form-group">
                <label>Overnight Protection Rule</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Liquidate intraday positions 15 minutes before market close"
                  value={strategy.overnight_protection.description || ''}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      overnight_protection: {
                        ...strategy.overnight_protection,
                        description: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Don&apos;t Rollover After</label>
                  <input
                    type="text"
                    value={strategy.advanced_settings.dont_rollover}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          dont_rollover: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Reactivate on Exit After</label>
                  <input
                    type="text"
                    value={strategy.advanced_settings.reactivate_on_exit_after}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        advanced_settings: {
                          ...strategy.advanced_settings,
                          reactivate_on_exit_after: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}

          {/* Tab 4: Marketplace */}
          {activeTab === 'marketplace' && (
            <>
              <div className="config-section-title">Marketplace & Sharing</div>

              <label className="checkbox-row" style={{ marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={strategy.marketplace_settings.public_strategy}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      marketplace_settings: {
                        ...strategy.marketplace_settings,
                        public_strategy: e.target.checked,
                      },
                    })
                  }
                />
                Make Strategy Public on Marketplace
              </label>

              <div className="form-row">
                <div className="form-group">
                  <label>Fee Type</label>
                  <select
                    value={strategy.marketplace_settings.fee_type}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          fee_type: e.target.value as 'Percentage' | 'Fixed',
                        },
                      })
                    }
                  >
                    <option value="Percentage">Percentage</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Min Monthly Fee ($)</label>
                  <input
                    type="number"
                    step="1"
                    value={strategy.marketplace_settings.min_monthly_fixed_fee}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          min_monthly_fixed_fee: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Fee Frequency</label>
                  <select
                    value={strategy.marketplace_settings.frequency_for_variable_fee}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          frequency_for_variable_fee: e.target.value as 'Per Minute' | 'Per Hour' | 'Per Day' | 'Per Week' | 'Per Month',
                        },
                      })
                    }
                  >
                    <option value="Per Month">Per Month</option>
                    <option value="Per Week">Per Week</option>
                    <option value="Per Day">Per Day</option>
                    <option value="Per Hour">Per Hour</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Max Multiple for Subscriber</label>
                  <input
                    type="number"
                    value={strategy.marketplace_settings.max_multiple_for_subscriber}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          max_multiple_for_subscriber: parseInt(e.target.value) || 100,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="config-section-title">Sharing Permissions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={strategy.marketplace_settings.allow_others_to_duplicate_strategy}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          allow_others_to_duplicate_strategy: e.target.checked,
                        },
                      })
                    }
                  />
                  Allow others to duplicate strategy
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={strategy.marketplace_settings.show_live_trades}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          show_live_trades: e.target.checked,
                        },
                      })
                    }
                  />
                  Show live trades publicly
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={strategy.marketplace_settings.confirm_each_subscriber_manually}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        marketplace_settings: {
                          ...strategy.marketplace_settings,
                          confirm_each_subscriber_manually: e.target.checked,
                        },
                      })
                    }
                  />
                  Confirm each subscriber manually
                </label>
              </div>
            </>
          )}

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
