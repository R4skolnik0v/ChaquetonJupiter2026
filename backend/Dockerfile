FROM python:3.13-slim
WORKDIR /app

# Install system deps needed for some wheels (optional, kept minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Copy only what's needed for installing requirements first
COPY requirements.txt ./

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
