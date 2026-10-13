import pytest
from app.strategies.schemas import (
    StrategySchema,
    UniversalExit,
    OvernightProtection,
    PriceExecution,
    TradingStopLoss,
    AdvancedSettings,
    MarketplaceSettings
)

def test_default_strategy_schema():
    strategy = StrategySchema(name="Test Strategy", description="A test strategy")
    assert strategy.name == "Test Strategy"
    assert strategy.description == "A test strategy"
    assert isinstance(strategy.advanced_settings, AdvancedSettings)
    assert isinstance(strategy.marketplace_settings, MarketplaceSettings)
    assert strategy.advanced_settings.price_execution.initial_price == "Market"

def test_full_strategy_schema():
    data = {
        "name": "Full Strategy",
        "description": "Comprehensive strategy test",
        "universal_exit": {
            "description": "Exit at end of day",
            "conditions": ["RSI > 80"]
        },
        "overnight_protection": {
            "description": "Close all positions before market close"
        },
        "advanced_settings": {
            "price_execution": {
                "initial_price": "Limit",
                "increase_by": "2 Ticks",
                "timeout": "10 Seconds",
                "final_action": "No - Follow Price Bidding",
                "follow_price_bidding": True
            },
            "trading_stop_loss": {
                "activate_at": 1.5,
                "profit_increased_by": 0.5,
                "increase_tsl_by": 0.2
            },
            "tranch_size": "50%",
            "execute_first": "every N seconds/minutes",
            "reactivate_on_exit_after": "5 seconds",
            "check_conditions_every": "on each tick",
            "capital_required": 200000,
            "take_trades": "Last condition before exchange close",
            "user_needed_capital_to_deploy": 100000,
            "choose_expiry": {"hours": 1, "minutes": 30},
            "dont_rollover": "5 minutes"
        },
        "marketplace_settings": {
            "public_strategy": True,
            "fee_type": "Fixed",
            "min_monthly_fixed_fee": 10.0,
            "max_multiple_for_subscriber": 50,
            "frequency_for_variable_fee": "Per Day",
            "allow_others_to_duplicate_strategy": True,
            "reciprocate_did_positions_for_new_subscriber": True,
            "confirm_each_subscriber_manually": True,
            "show_live_trades": True,
            "min_monthly_fixed_fee_variable": 5.0,
            "frequency_for_variable_fee_variable": "Per Week",
            "max_multiple_for_subscriber_variable": 20
        }
    }

    strategy = StrategySchema(**data)
    assert strategy.name == "Full Strategy"
    assert strategy.universal_exit.description == "Exit at end of day"
    assert strategy.advanced_settings.price_execution.initial_price == "Limit"
    assert strategy.marketplace_settings.public_strategy is True

def test_strategy_with_custom_indicators():
    from app.strategies.schemas import StrategySchema, IndicatorConfig
    strategy = StrategySchema(
        name="BB Strategy",
        custom_indicators=[
            IndicatorConfig(type="bollinger_bands", params={"period": 20, "num_std": 2.0}),
            IndicatorConfig(type="fibonacci_pivots", params={"lookback_days": 1})
        ]
    )
    assert len(strategy.custom_indicators) == 2
    assert strategy.custom_indicators[0].type == "bollinger_bands"
    assert strategy.custom_indicators[0].params["period"] == 20

