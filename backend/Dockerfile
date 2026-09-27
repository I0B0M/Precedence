# Precedence's API as one container (docs/v2-plan.md, milestone M1): FastAPI on uvicorn, reading Postgres
# at DATABASE_URL. Build from the backend directory:
#   docker build -t stone-api -f backend/Dockerfile backend
#   docker run --rm -p 8000:8000 -e DATABASE_URL=postgresql://... stone-api
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
RUN pip install --no-cache-dir "uv>=0.8"
WORKDIR /app
# Dependencies first, so a code change doesn't reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev
RUN useradd --create-home stone && chown -R stone:stone /app
USER stone
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD ["/app/.venv/bin/python", "-c", "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/status', timeout=4)"]
CMD ["/app/.venv/bin/uvicorn", "stone.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
