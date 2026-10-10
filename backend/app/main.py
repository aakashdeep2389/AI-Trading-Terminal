from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from .api.routes import router
from .core.config import settings
from .core.ratelimit import limiter
from .core.observability import configure_logging, ObservabilityMiddleware
from .db.database import init_db
from .market.stream import stream
from .alerts.processor import processor

@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await init_db()
    await stream.start()
    await processor.start()
    yield
    await processor.stop()
    await stream.stop()

app=FastAPI(title='AI Trading Platform API',version='1.2.0',lifespan=lifespan)
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(',')],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.include_router(router,prefix='/api')

# Serve uploaded screenshots as static files
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
