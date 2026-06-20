# Borsa Krali backtest sidecar — kernc/backtesting.py (Python 3.12)
# Render: ya bu Dockerfile ile ya da native Python runtime ile deploy edilir
# (bkz. README.md). Node backend buna BACKTEST_SERVICE_URL ile bağlanır.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Önce bağımlılıklar (katman cache'i)
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Uygulama
COPY app ./app

# Render $PORT enjekte eder; lokalde 8000.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
