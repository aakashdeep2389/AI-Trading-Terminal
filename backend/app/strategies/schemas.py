from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any, Literal

class UniversalExit(BaseModel):
    description: Optional[str] = None
    conditions: List[Any] = []

class OvernightProtection(BaseModel):
    description: Optional[str] = None

class PriceExecution(BaseModel):
    initial_price: Literal["Market", "Limit"] = "Market"
    increase_by: str = "1 Tick"
    timeout: str = "0 Second"
    final_action: Literal["Execute at Market Price", "No - Follow Price Bidding"] = "Execute at Market Price"
    follow_price_bidding: bool = False

class TradingStopLoss(BaseModel):
    activate_at: float = 0.0
    profit_increased_by: float = 0.0
    increase_tsl_by: float = 0.0

class AdvancedSettings(BaseModel):
    price_execution: PriceExecution = PriceExecution()
    trading_stop_loss: TradingStopLoss = TradingStopLoss()
    tranch_size: Literal["100%", "50%", "25%"] = "100%"
    execute_first: Literal["once", "every N seconds/minutes"] = "once"
    reactivate_on_exit_after: str = "1 second"
    check_conditions_every: Literal["continuously", "on each tick"] = "continuously"
    capital_required: int = 100000
    take_trades: Literal["Start condition after exchange open", "Last condition before exchange close"] = "Start condition after exchange open"
    user_needed_capital_to_deploy: int = 50000
    choose_expiry: Dict[str, int] = {"hours": 0, "minutes": 1}
    dont_rollover: str = "1 minute"

class MarketplaceSettings(BaseModel):
    public_strategy: bool = False
    fee_type: Literal["Percentage", "Fixed"] = "Percentage"
    min_monthly_fixed_fee: float = 0.0
    max_multiple_for_subscriber: int = 100
    frequency_for_variable_fee: Literal["Per Minute", "Per Hour", "Per Day", "Per Week", "Per Month"] = "Per Month"
    allow_others_to_duplicate_strategy: bool = False
    reciprocate_did_positions_for_new_subscriber: bool = False
    confirm_each_subscriber_manually: bool = False
    show_live_trades: bool = False
    min_monthly_fixed_fee_variable: float = 0.0
    frequency_for_variable_fee_variable: Literal["Per Minute", "Per Hour", "Per Day", "Per Week", "Per Month"] = "Per Month"
    max_multiple_for_subscriber_variable: int = 100

class IndicatorConfig(BaseModel):
    type: str
    params: Dict[str, Any] = {}

class StrategySchema(BaseModel):
    name: str = Field(default='EMA Crossover', min_length=1, max_length=100)
    description: str = Field(default='Strategy description')
    fast: int = Field(20, ge=2, le=200)
    slow: int = Field(50, ge=3, le=400)
    risk_pct: float = Field(1.0, gt=0, le=5)
    rsi_buy_below: Optional[float] = Field(default=None, gt=0, lt=100)
    price_above_ema: Optional[int] = Field(default=None, ge=2, le=400)
    stop_atr_multiple: float = Field(default=2.0, gt=0, le=10)

    strategy_intent: Optional[str] = None
    tags: List[str] = []
    initialize_variables: List[Any] = []
    entry_conditions: List[Any] = []
    repair: List[Any] = []
    custom_indicators: List[IndicatorConfig] = []
    universal_exit: UniversalExit = Field(default_factory=UniversalExit)
    overnight_protection: OvernightProtection = Field(default_factory=OvernightProtection)
    advanced_settings: AdvancedSettings = Field(default_factory=AdvancedSettings)
    marketplace_settings: MarketplaceSettings = Field(default_factory=MarketplaceSettings)

    @model_validator(mode='after')
    def periods_are_valid(self):
        if self.fast >= self.slow:
            raise ValueError('fast period must be less than slow period')
        return self

# Alias for backwards compatibility
Strategy = StrategySchema
