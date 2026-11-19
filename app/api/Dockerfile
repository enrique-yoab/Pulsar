FROM python:3.12-alpine

WORKDIR /app

COPY server.py db.py /app/api/

ENV PYTHONUNBUFFERED=1 \
    PULSAR_API_HOST=0.0.0.0 \
    PULSAR_API_PORT=8000 \
    PULSAR_BD_DIR=/app/BD

EXPOSE 8000

CMD ["python3", "/app/api/server.py"]
