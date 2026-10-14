from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from backend.analyzer.model_analyzer import ModelAnalyzer, SUPPORTED_EXTENSIONS
from backend.utils.storage import load_analysis, save_analysis

router = APIRouter()
analyzer = ModelAnalyzer()


@router.post("/analyze-model")
async def analyze_model(file: UploadFile = File(...)):
    filename = file.filename or "uploaded-model"
    suffix = f".{filename.split('.')[-1].lower()}" if "." in filename else ""
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported formats: {', '.join(sorted(ext.removeprefix('.') for ext in SUPPORTED_EXTENSIONS))}.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = await run_in_threadpool(analyzer.analyze_bytes, filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

    analysis_id = str(uuid4())
    payload = {"analysis_id": analysis_id, **result}
    save_analysis(analysis_id, payload)
    return payload


@router.get("/analysis/{analysis_id}")
def get_analysis(analysis_id: str):
    payload = load_analysis(analysis_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return payload
