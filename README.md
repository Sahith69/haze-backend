# Monochrome Player (Self-Hosted)

An open-source, privacy-first, ad-free music web player built with the signature pure black Monochrome aesthetic and a reliable local audio resolver.

## Features

- **Infinite Catalog:** Instant search across millions of studio songs, albums, and artists.
- **Ultra High-Res Artwork:** Up to 1000x1000 crisp Retina/4K album art via Apple Music catalog.
- **Synced Lyrics (`L`):** Real-time line-by-line synchronized lyrics powered by LRCLIB with click-to-seek navigation.
- **Audio Spectrum Visualizer (`V`):** Real-time Web Audio API frequency spectrum reacting dynamically to bass and treble.
- **Spotify Importer:** Direct import for Spotify playlists via Exportify `.csv` or text paste.
- **No 429 Rate Limits:** Runs a local stream resolver with caching and partial range seek support.
- **Keyboard Shortcuts:**
  - `Space`: Play / Pause
  - `→` / `←`: Seek +/- 5s
  - `Shift` + `→` / `Shift` + `←`: Next / Previous track
  - `L`: Toggle Synced Lyrics
  - `V`: Toggle Audio Visualizer
  - `Q`: Toggle Queue drawer
  - `M`: Mute / Unmute
  - `/`: Focus Search Bar

## Quick Start

### Start Server
```bash
cd /home/sahith/Projects/monochrome-player
node server.js
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser.

### Development Mode (with hot-reload)
```bash
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.
