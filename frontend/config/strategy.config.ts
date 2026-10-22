export interface AdvancedSettings {
  max_open_trades: number;
  max_daily_drawdown_pct: number;
  trailing_stop_enabled: boolean;
  trailing_stop_activation_pct: number;
  trailing_stop_callback_pct: number;
}

export interface MarketplaceSettings {
  is_public: boolean;
  author: string;
  category: string;
  tags: string[];
}

export interface CustomIndicatorConfig {
  type: string;
  params: Record<string, any>;
}

export interface UniversalExitConfig {
  description: string;
  conditions: string[];
}

export interface OvernightProtectionConfig {
  description: string;
}

export interface ConfluenceSettings {
  min_score: number;
}

export interface StrategyConfig {
  name: string;
  fast: number;
  slow: number;
  risk_pct: number;
  stop_atr_multiple: number;
  stop_buffer?: number;
  custom_indicators: CustomIndicatorConfig[];
  universal_exit: UniversalExitConfig;
  overnight_protection: OvernightProtectionConfig;
  advanced_settings: AdvancedSettings;
  marketplace_settings: MarketplaceSettings;
  confluence_settings?: ConfluenceSettings;
}

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  max_open_trades: 3,
  max_daily_drawdown_pct: 3.0,
  trailing_stop_enabled: false,
  trailing_stop_activation_pct: 1.0,
  trailing_stop_callback_pct: 0.5,
};

export const DEFAULT_MARKETPLACE_SETTINGS: MarketplaceSettings = {
  is_public: false,
  author: 'Trader',
  category: 'Technical',
  tags: ['Bollinger', 'Fibonacci'],
};
