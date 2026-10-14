# 3D Model Validation Backend

## Run

```bash
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## Free Deployment (Render)

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Render will read `render.yaml` and deploy `printopia-backend` on the free plan.
4. After deploy, copy your backend URL (for example: `https://printopia-backend.onrender.com`).
5. Verify backend health at `/health`.

## Connect Hosted Frontend To Backend

From the project root, run the following in PowerShell after you have the Render URL:

```powershell
$env:VITE_API_BASE_URL="https://YOUR-RENDER-URL.onrender.com"
npm run build --prefix frontend
npx firebase-tools deploy --only hosting
```

This rebuilds the frontend with the hosted backend URL and redeploys Firebase Hosting.

## Endpoints

- `POST /analyze-model` with multipart field `file`
- `GET /analysis/{analysis_id}`
- `GET /health`

## Supported Formats

- STL
- OBJ
- PLY
- GLB
