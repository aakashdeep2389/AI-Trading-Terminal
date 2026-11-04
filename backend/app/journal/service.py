import os
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime
from typing import Optional, List, Dict, Any
import pandas as pd
from io import StringIO
import json
from pydantic import BaseModel, ValidationError, Field
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


class ImportTradeSchema(BaseModel):
    symbol: str
    direction: str
    entry_price: float
    position_size: float = Field(default=1.0)
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    exit_price: Optional[float] = None
    strategy_tag: Optional[str] = None
    timeframe: Optional[str] = None
    emotion: Optional[str] = None
    notes: Optional[str] = None
    screenshot_path: Optional[str] = None
    trade_date: datetime
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    outcome: Optional[str] = None

    class Config:
        extra = 'ignore'


async def export_trades_to_format(symbol: Optional[str], outcome: Optional[str], format: str, db: AsyncSession) -> str:
    trades: List[JournalTrade] = await JournalService.get_all(db, symbol=symbol, outcome=outcome, limit=None)

    if not trades:
        if format.lower() == 'csv':
            return "symbol,direction,entry_price,exit_price,position_size,stop_loss,take_profit,pnl,pnl_pct,outcome,strategy_tag,timeframe,emotion,notes,screenshot_path,trade_date\n"
        elif format.lower() == 'json':
            return "[]"
        else:
            raise ValueError(f"Unsupported format: {format}")

    trade_dicts = []
    for trade in trades:
        trade_dict = {}
        for column in JournalTrade.__table__.columns:
            value = getattr(trade, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            trade_dict[column.name] = value
        trade_dicts.append(trade_dict)

    df = pd.DataFrame(trade_dicts)
    column_order = [
        'id', 'symbol', 'direction', 'entry_price', 'exit_price', 'position_size',
        'stop_loss', 'take_profit', 'pnl', 'pnl_pct', 'outcome', 'strategy_tag',
        'timeframe', 'emotion', 'notes', 'screenshot_path', 'trade_date',
        'created_at', 'updated_at'
    ]
    existing_columns_in_order = [col for col in column_order if col in df.columns]
    df = df[existing_columns_in_order]

    if format.lower() == 'csv':
        output = StringIO()
        df.to_csv(output, index=False)
        return output.getvalue()
    elif format.lower() == 'json':
        return df.to_json(orient='records', indent=2)
    else:
        raise ValueError(f"Unsupported format: {format}")


async def import_trades_from_file(file, db: AsyncSession) -> Dict[str, Any]:
    content = await file.read()
    filename = file.filename.lower()

    imported_count = 0
    failed_count = 0
    failed_messages = []

    try:
        if filename.endswith('.csv'):
            data_io = StringIO(content.decode('utf-8'))
            df = pd.read_csv(data_io)
            records = df.to_dict(orient='records')
        elif filename.endswith('.json'):
            parsed_json = json.loads(content)
            if isinstance(parsed_json, list):
                records = parsed_json
            elif isinstance(parsed_json, dict):
                # Check common keys or wrap single trade dict
                if "trades" in parsed_json and isinstance(parsed_json["trades"], list):
                    records = parsed_json["trades"]
                elif "data" in parsed_json and isinstance(parsed_json["data"], list):
                    records = parsed_json["data"]
                elif "symbol" in parsed_json:
                    records = [parsed_json]
                else:
                    # Look for any list in the dict values
                    found_list = next((v for v in parsed_json.values() if isinstance(v, list)), None)
                    if found_list is not None:
                        records = found_list
                    else:
                        raise ValueError("JSON object must contain a list of trades or a single trade object.")
            else:
                raise ValueError("Invalid JSON format.")
        else:
            raise ValueError("Unsupported file format. Please upload CSV or JSON.")

        for i, record in enumerate(records):
            try:
                # Map keys from incoming JSON to our schema
                mapping = {
                    'instrument': 'symbol',
                    'quantity': 'position_size',
                    'strategy': 'strategy_tag'
                }
                for old_key, new_key in mapping.items():
                    if old_key in record and new_key not in record:
                        record[new_key] = record.pop(old_key)

                cleaned_record = {}
                for k, v in record.items():
                    if v == "" or (isinstance(v, (list, pd.Series)) and len(v) == 0) or (not isinstance(v, (list, pd.Series)) and pd.isna(v)):
                        cleaned_record[k] = None
                    else:
                        cleaned_record[k] = v
                if 'trade_date' in cleaned_record and cleaned_record['trade_date']:
                    cleaned_record['trade_date'] = str(cleaned_record['trade_date'])

                trade_data = ImportTradeSchema(**cleaned_record)

                await JournalService.create_trade(
                    symbol=trade_data.symbol,
                    direction=trade_data.direction,
                    entry_price=trade_data.entry_price,
                    position_size=trade_data.position_size,
                    stop_loss=trade_data.stop_loss,
                    take_profit=trade_data.take_profit,
                    exit_price=trade_data.exit_price,
                    strategy_tag=trade_data.strategy_tag,
                    timeframe=trade_data.timeframe,
                    emotion=trade_data.emotion,
                    notes=trade_data.notes,
                    screenshot_path=trade_data.screenshot_path,
                    trade_date=trade_data.trade_date,
                    db=db,
                )
                imported_count += 1
            except ValidationError as e:
                failed_count += 1
                failed_messages.append(f"Row {i+1}: Validation error - {e.errors()}")
            except Exception as e:
                failed_count += 1
                failed_messages.append(f"Row {i+1}: Import error - {str(e)}")

    except ValueError as e:
        failed_count += 1
        failed_messages.append(f"File processing error: {str(e)}")
    except Exception as e:
        failed_count += 1
        failed_messages.append(f"Unexpected error processing file: {str(e)}")

    return {"imported_count": imported_count, "failed_count": failed_count, "failed_messages": failed_messages}


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


@router.get("/journal/export")
async def export_journal_trades(
    symbol: Optional[str] = None,
    outcome: Optional[str] = None,
    format: str = 'csv',
    db: AsyncSession = Depends(get_db)
):
    if format.lower() not in ['csv', 'json']:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'json'")

    try:
        data = await export_trades_to_format(symbol=symbol, outcome=outcome, format=format, db=db)
        filename = f"journal_trades.{format}"
        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": f"text/{format}" if format == 'csv' else "application/json",
        }
        return Response(content=data, headers=headers, media_type=f"text/{format}" if format == 'csv' else "application/json")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during export: {e}")


@router.post("/journal/import", status_code=200)
async def import_journal_trades(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.lower().endswith(('.csv', '.json')):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV or JSON.")

    try:
        result = await import_trades_from_file(file, db)
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during import: {e}")

