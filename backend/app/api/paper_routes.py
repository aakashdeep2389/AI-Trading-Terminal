from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..db.database import get_db
from ..db.models import PaperStrategyState
from ..engine.paper_engine import engine
from pydantic import BaseModel

router = APIRouter()

class ConfigUpdate(BaseModel):
    symbol: str
    timeframe: str
    config: dict

@router.get("/status")
async def get_status(db: AsyncSession = Depends(get_db)):
    return engine.get_status()

@router.post("/start")
async def start_paper_engine():
    engine.start()
    return {"status": "started"}

@router.post("/stop")
async def stop_paper_engine():
    engine.stop()
    return {"status": "stopped"}

@router.post("/config")
async def update_config(payload: ConfigUpdate):
    engine.update_config(payload.symbol, payload.timeframe, payload.config)
    return {"status": "updated"}
