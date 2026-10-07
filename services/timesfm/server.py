"""TimesFM sidecar for RideSurge.

Serves the contract the Next.js app calls from `src/lib/forecast/timesfm.ts`:

    POST /forecast
    {
      "horizon": 12,
      "step_minutes": 15,
      "series": [
        {"id": "SEA", "context": [...768 values...], "covariates": [[...780...], [...780...]]}
      ]
    }
    ->
    {"model": "google/timesfm-3.0-pytorch",
     "series": [{"id": "SEA", "point": [...12...], "q10": [...12...], "q90": [...12...]}]}

Each zone is one target series (ride requests per 15 minutes). Its covariates
are known into the future (flight-driven curb demand and venue egress), so they
are passed to TimesFM as `past_future_covariates`.

Run it:

    uv run --with "timesfm[torch]" --with fastapi --with uvicorn \
        uvicorn server:app --host 127.0.0.1 --port 8765

Then start the app with TIMESFM_URL=http://127.0.0.1:8765

Environment:
    TIMESFM_CHECKPOINT  Hugging Face repo id (default google/timesfm-3.0-pytorch)
    TIMESFM_BACKEND     "torch" (default) or "mlx" for Apple silicon
    TIMESFM_DEVICE      torch device (default: cuda if available, else cpu)
"""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

CHECKPOINT = os.environ.get("TIMESFM_CHECKPOINT", "google/timesfm-3.0-pytorch")
BACKEND = os.environ.get("TIMESFM_BACKEND", "torch").lower()

# TimesFM returns nine deciles, 0.1 through 0.9.
Q10, Q90 = 0, 8


class Series(BaseModel):
    id: str
    context: list[float] = Field(min_length=32)
    covariates: list[list[float]] = []


class ForecastRequest(BaseModel):
    horizon: int = Field(gt=0, le=1024)
    step_minutes: int = 15
    series: list[Series] = Field(min_length=1, max_length=64)


class SeriesForecast(BaseModel):
    id: str
    point: list[float]
    q10: list[float]
    q90: list[float]


class ForecastResponse(BaseModel):
    model: str
    series: list[SeriesForecast]


@lru_cache(maxsize=1)
def load_model():
    """Load the checkpoint once; the first request pays for the download."""
    if BACKEND == "mlx":
        from timesfm3.mlx import TimesFM3Forecaster

        return TimesFM3Forecaster.from_pretrained(CHECKPOINT)

    import torch
    from timesfm3 import ModelConfig, TimesFM3Evaluator

    device = os.environ.get("TIMESFM_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
    return TimesFM3Evaluator(ModelConfig(checkpoint_path=CHECKPOINT, per_core_batch_size=16, device=device))


def arrays(series: Series, horizon: int) -> tuple[np.ndarray, np.ndarray | None]:
    """Target as (1, context) and covariates as (k, context + horizon)."""
    target = np.asarray(series.context, dtype=np.float32)[None, :]
    if not series.covariates:
        return target, None
    expected = target.shape[1] + horizon
    covariates = np.asarray(series.covariates, dtype=np.float32)
    if covariates.ndim != 2 or covariates.shape[1] != expected:
        raise HTTPException(422, f"series {series.id}: each covariate needs {expected} values (context + horizon)")
    return target, covariates


def run(model, request: ForecastRequest) -> list[tuple[np.ndarray, np.ndarray]]:
    """Returns (point, quantiles) per series, shaped (horizon,) and (horizon, 9)."""
    prepared = [arrays(s, request.horizon) for s in request.series]

    if BACKEND == "mlx":
        results = []
        for target, covariates in prepared:
            kwargs = {} if covariates is None else {"past_future_covariates": covariates}
            out = model.predict(target, horizon=request.horizon, return_quantiles=True, **kwargs)
            results.append((np.asarray(out.forecast)[0], np.asarray(out.quantiles)[0]))
        return results

    # One batch per covariate layout, so series with and without covariates can be mixed.
    results: list[tuple[np.ndarray, np.ndarray] | None] = [None] * len(prepared)
    for with_covariates in (True, False):
        index = [i for i, (_, c) in enumerate(prepared) if (c is not None) == with_covariates]
        if not index:
            continue
        kwargs = {"past_future_covariates": [prepared[i][1] for i in index]} if with_covariates else {}
        outputs = model.predict_batch(
            contexts=[prepared[i][0] for i in index],
            horizon=request.horizon,
            return_quantiles=True,
            use_symmetric_averaging=False,
            **kwargs,
        )
        for i, out in zip(index, outputs):
            results[i] = (np.asarray(out.forecast)[0], np.asarray(out.quantiles)[0])
    return [r for r in results if r is not None]


app = FastAPI(title="RideSurge TimesFM sidecar")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "model": CHECKPOINT, "backend": BACKEND}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(request: ForecastRequest) -> ForecastResponse:
    outputs = run(load_model(), request)
    series = []
    for item, (point, quantiles) in zip(request.series, outputs):
        # Ride requests cannot be negative.
        series.append(
            SeriesForecast(
                id=item.id,
                point=np.clip(point, 0, None).round(2).tolist(),
                q10=np.clip(quantiles[:, Q10], 0, None).round(2).tolist(),
                q90=np.clip(quantiles[:, Q90], 0, None).round(2).tolist(),
            )
        )
    return ForecastResponse(model=CHECKPOINT, series=series)
