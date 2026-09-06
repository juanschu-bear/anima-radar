from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import HealthResponse, ProfileAnswers, ProfileResponse, ScanCreate, ScanResponse
from .store import DevelopmentStore
from .worker import JobWorker

store = DevelopmentStore()
worker = JobWorker()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    worker.stop()


settings = get_settings()
app = FastAPI(title="AnimaRadar API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.radar_allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, service="radar-api", environment=settings.radar_env)


@app.post("/profiles", response_model=ProfileResponse, status_code=201)
async def create_profile(answers: ProfileAnswers) -> ProfileResponse:
    return store.create_profile(answers)


@app.get("/profiles/{profile_id}", response_model=ProfileResponse)
async def get_profile(profile_id: UUID) -> ProfileResponse:
    profile = store.profiles.get(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return ProfileResponse(id=profile.id, icp=profile.icp, search_plan=profile.search_plan)


@app.post("/scans", response_model=ScanResponse, status_code=201)
async def create_scan(request: ScanCreate) -> ScanResponse:
    return store.create_scan(request)


@app.get("/scans/{scan_id}", response_model=ScanResponse)
async def get_scan(scan_id: UUID) -> ScanResponse:
    scan = store.get_scan(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
