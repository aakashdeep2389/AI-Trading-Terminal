import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db.database import Base
from app.db.models import PaperStrategyState

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()

@pytest.mark.asyncio
async def test_paper_strategy_state_model(db_session: AsyncSession):
    state = PaperStrategyState(
        strategy_name="bollinger_mtf_paper",
        is_active=True,
        symbol="XAUUSD",
        timeframe="5m",
        config={"bb_period": 20, "bb_std": 1.4}
    )
    db_session.add(state)
    await db_session.commit()
    await db_session.refresh(state)

    assert state.id is not None
    assert state.strategy_name == "bollinger_mtf_paper"
    assert state.is_active is True
    assert state.symbol == "XAUUSD"
    assert state.config["bb_std"] == 1.4
