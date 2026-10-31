FROM node:20-bookworm-slim

# Install Python3, pip, ffmpeg, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp & ytmusicapi
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp ytmusicapi

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Build Vite frontend
RUN npm run build

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
