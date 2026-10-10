import os
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime
from typing import Optional
from ..db.database import get_db
from ..db.models import JournalTrade

router = APIRouter()
UPLOAD_DIR = Path("uploads/journal")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class JournalService:
    @staticmethod
    async def create_trade(
        symbol: str, direction: str, entry_price: float, position_size: float,
        stop_loss: float = None, take_profit: float = None, exit_price: float = None,
        strategy_tag: str = None, timeframe: str = None, emotion: str = None,
        notes: str = None, screenshot_path: str = None, trade_date: datetime = None,
        db: AsyncSession = None
    ):
        trade = JournalTrade(
            symbol=symbol.upper(), direction=direction, entry_price=entry_price,
            position_size=position_size, stop_loss=stop_loss, take_profit=take_profit,
            exit_price=exit_price, strategy_tag=strategy_tag, timeframe=timeframe,
            emotion=emotion, notes=notes, screenshot_path=screenshot_path,
            trade_date=trade_date or datetime.utcnow()
        )
        if exit_price is not None:
            # Contract size multiplier (1 lot = 100 units)
            multiplier = position_size * 100
            if direction.strip().lower() == "long":
                trade.pnl = (exit_price - entry_price) * multiplier
            else: # short
                trade.pnl = (entry_price - exit_price) * multiplier
            
            if entry_price != 0: # Avoid division by zero
                # PnL % based on the initial value of the position
                trade.pnl_pct = (trade.pnl / (entry_price * multiplier)) * 100
            else:
                trade.pnl_pct = 0
            trade.outcome = "win" if trade.pnl > 0 else ("loss" if trade.pnl < 0 else "breakeven")
        else:
            trade.outcome = "open"
        db.add(trade)
        await db.commit()
        await db.refresh(trade)
        return trade

    @staticmethod
    async def get_all(db: AsyncSession, symbol: str = None, outcome: str = None, limit: int = 100):
        stmt = select(JournalTrade).order_by(desc(JournalTrade.trade_date)).limit(limit)
        if symbol:
            stmt = stmt.where(JournalTrade.symbol == symbol.upper())
        if outcome:
            stmt = stmt.where(JournalTrade.outcome == outcome)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_stats(db: AsyncSession, symbol: str = None):
        stmt = select(JournalTrade).where(JournalTrade.outcome.isnot(None))
        if symbol:
            stmt = stmt.where(JournalTrade.symbol == symbol.upper())
        result = await db.execute(stmt)
        trades = result.scalars().all()

        if not trades:
            return {"total_trades": 0, "win_rate": 0, "total_pnl": 0, "profit_factor": 1, "avg_rr": 0, "streak": 0}

        wins = [t for t in trades if t.outcome == "win"]
        losses = [t for t in trades if t.outcome == "loss"]
        win_sum = sum(t.pnl for t in wins if t.pnl)
        loss_sum = abs(sum(t.pnl for t in losses if t.pnl))

        return {
            "total_trades": len(trades),
            "win_rate": (len(wins) / len(trades)) * 100,
            "total_pnl": sum(t.pnl for t in trades if t.pnl),
            "profit_factor": win_sum / loss_sum if loss_sum > 0 else 1,
            "avg_rr": sum(
                (t.take_profit - t.entry_price) / (t.entry_price - t.stop_loss)
                for t in trades if t.stop_loss and t.take_profit and (t.entry_price - t.stop_loss) != 0
            ) / len(trades),
            "streak": max(
                [len(list(g)) for k, g in __import__('itertools').groupby(trades, key=lambda t: t.outcome == "win")],
                default=0
            ),
        }

    @staticmethod
    async def upload_screenshot(file: UploadFile):
        filename = f"{datetime.utcnow().timestamp()}_{file.filename}"
        filepath = UPLOAD_DIR / filename
        with open(filepath, "wb") as f:
            f.write(await file.read())
        return f"/uploads/journal/{filename}"

    @staticmethod
    async def update_trade(
        trade_id: int, symbol: str, direction: str, entry_price: float, position_size: float,
        stop_loss: float = None, take_profit: float = None, exit_price: float = None,
        strategy_tag: str = None, timeframe: str = None, emotion: str = None,
        notes: str = None, screenshot_path: str = None, trade_date: datetime = None,
        db: AsyncSession = None
    ):
        result = await db.execute(select(JournalTrade).where(JournalTrade.id == trade_id))
        trade = result.scalar_one_or_none()
        if not trade:
            return None
        trade.symbol = symbol.upper()
        trade.direction = direction
        trade.entry_price = entry_price
        trade.position_size = position_size
        trade.stop_loss = stop_loss
        trade.take_profit = take_profit
        trade.exit_price = exit_price
        trade.strategy_tag = strategy_tag
        trade.timeframe = timeframe
        trade.emotion = emotion
        trade.notes = notes
        if screenshot_path:
            trade.screenshot_path = screenshot_path
        if trade_date:
            trade.trade_date = trade_date

        if exit_price is not None:
            # Contract size multiplier (1 lot = 100 units)
            multiplier = position_size * 100
            if direction.strip().lower() == "long":
                trade.pnl = (exit_price - entry_price) * multiplier
            else: # short
                trade.pnl = (entry_price - exit_price) * multiplier
            
            if entry_price != 0: # Avoid division by zero
                # PnL % based on the initial value of the position
                trade.pnl_pct = (trade.pnl / (entry_price * multiplier)) * 100
            else:
                trade.pnl_pct = 0
            trade.outcome = "win" if trade.pnl > 0 else ("loss" if trade.pnl < 0 else "breakeven")
        else:
            trade.pnl = None
            trade.pnl_pct = None
            trade.outcome = "open"

        await db.commit()
        await db.refresh(trade)
        return trade

    @staticmethod
    async def delete_trade(trade_id: int, db: AsyncSession):
        result = await db.execute(select(JournalTrade).where(JournalTrade.id == trade_id))
        trade = result.scalar_one_or_none()
        if not trade:
            return False
        if trade.screenshot_path:
            local = trade.screenshot_path.lstrip("/")
            if os.path.exists(local):
                os.remove(local)
        await db.delete(trade)
        await db.commit()
        return True


journal_service = JournalService()


def _safe(value):
    """Return None for empty strings so optional floats stay None."""
    if value is None or value == "":
        return None
    return value


# Routes
@router.post("/journal/trades")
async def create_journal_trade(
    symbol: str = Form(...),
    direction: str = Form(...),
    entry_price: float = Form(...),
    position_size: float = Form(1.0),
    stop_loss: Optional[str] = Form(None),
    take_profit: Optional[str] = Form(None),
    exit_price: Optional[str] = Form(None),
    strategy_tag: Optional[str] = Form(None),
    timeframe: Optional[str] = Form(None),
    emotion: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    trade_date: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    screenshot_path = None
    if screenshot and screenshot.filename:
        screenshot_path = await journal_service.upload_screenshot(screenshot)

    def to_float(v):
        v = _safe(v)
        return float(v) if v is not None else None

    trade = await journal_service.create_trade(
        symbol=symbol,
        direction=direction,
        entry_price=entry_price,
        position_size=position_size,
        stop_loss=to_float(stop_loss),
        take_profit=to_float(take_profit),
        exit_price=to_float(exit_price),
        strategy_tag=_safe(strategy_tag),
        timeframe=_safe(timeframe),
        emotion=_safe(emotion),
        notes=_safe(notes),
        screenshot_path=screenshot_path,
        trade_date=datetime.fromisoformat(trade_date) if _safe(trade_date) else None,
        db=db,
    )
    d = {c.key: getattr(trade, c.key) for c in trade.__table__.columns}
    return d


@router.get("/journal/trades")
async def get_journal_trades(
    symbol: str = None, outcome: str = None, limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    trades = await journal_service.get_all(db, symbol, outcome, limit)
    result = []
    for t in trades:
        row = {c.key: getattr(t, c.key) for c in t.__table__.columns}
        result.append(row)
    return {"trades": result}


@router.get("/journal/stats")
async def get_journal_stats(symbol: str = None, db: AsyncSession = Depends(get_db)):
    return await journal_service.get_stats(db, symbol)


@router.put("/journal/trades/{trade_id}")
async def update_journal_trade(
    trade_id: int,
    symbol: str = Form(...),
    direction: str = Form(...),
    entry_price: float = Form(...),
    position_size: float = Form(1.0),
    stop_loss: Optional[str] = Form(None),
    take_profit: Optional[str] = Form(None),
    exit_price: Optional[str] = Form(None),
    strategy_tag: Optional[str] = Form(None),
    timeframe: Optional[str] = Form(None),
    emotion: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    trade_date: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    screenshot_path = None
    if screenshot and screenshot.filename:
        screenshot_path = await journal_service.upload_screenshot(screenshot)
    
    def to_float(v):
        v = _safe(v)
        return float(v) if v is not None else None

    trade = await journal_service.update_trade(
        trade_id, symbol, direction, entry_price, position_size,
        to_float(stop_loss), to_float(take_profit), to_float(exit_price),
        _safe(strategy_tag), _safe(timeframe), _safe(emotion), _safe(notes),
        screenshot_path,
        datetime.fromisoformat(trade_date) if _safe(trade_date) else None, db
    )
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    d = {c.key: getattr(trade, c.key) for c in trade.__table__.columns}
    return d

@router.delete("/journal/trades/{trade_id}")
async def delete_journal_trade(trade_id: int, db: AsyncSession = Depends(get_db)):
    success = await journal_service.delete_trade(trade_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"success": True}
