import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3001;

// Cloudflare R2 Client Setup
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'haze-vault';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

let r2Client = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });
    console.log('[Cloudflare R2] Connected to storage bucket:', R2_BUCKET_NAME);
} else {
    console.log('[Cloudflare R2] Credentials not configured - using local/telegram vault.');
}

// Telegram Cloud Vault Setup (Automatic FLAC archiving)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const AUTO_ARCHIVE_TG = process.env.AUTO_ARCHIVE_TG !== 'false';

if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log('[Telegram FLAC Vault] Connected to Telegram channel:', TELEGRAM_CHAT_ID);
} else {
    console.log('[Telegram FLAC Vault] Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render to auto-archive FLACs.');
}

// Local Vault database path
const VAULT_DB_PATH = path.join(__dirname, 'vault.json');
function loadVault() {
    try {
        if (fs.existsSync(VAULT_DB_PATH)) {
            return JSON.parse(fs.readFileSync(VAULT_DB_PATH, 'utf-8'));
        }
    } catch (e) {}
    return [];
}
function saveVault(data) {
    try {
        fs.writeFileSync(VAULT_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save vault data:', e);
    }
}

/**
 * Transcode stream to uncompressed FLAC and archive directly into Telegram Channel
 */
const archivingSet = new Set();
async function archiveTrackToTelegram(track, streamUrl) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !streamUrl) return null;

    const trackId = String(track.id || `${track.artist}_${track.title}`.replace(/[^a-zA-Z0-9]/g, '_'));
    if (archivingSet.has(trackId)) return null;

    // Check if already in vault with Telegram message
    const currentVault = loadVault();
    const existing = currentVault.find(t => String(t.id) === trackId && t.telegramMessageId);
    if (existing) {
        return existing;
    }

    archivingSet.add(trackId);
    const safeTitle = (track.title || 'Track').replace(/[/\\?%*:|"<>]/g, '_');
    const safeArtist = (track.artist || 'Artist').replace(/[/\\?%*:|"<>]/g, '_');
    const flacFileName = `${safeArtist} - ${safeTitle}.flac`;
    const flacPath = path.join('/tmp', `haze_${Date.now()}_${Math.random().toString(36).substring(7)}.flac`);

    console.log(`[Telegram FLAC Vault] Encoding "${track.title}" by ${track.artist} to FLAC...`);

    try {
        const ffmpegArgs = [
            '-y',
            '-i', streamUrl,
            '-c:a', 'flac',
            '-sample_fmt', 's16',
            '-ar', '44100',
            '-metadata', `title=${track.title || ''}`,
            '-metadata', `artist=${track.artist || ''}`,
            '-metadata', `album=${track.album || 'HAZE FLAC Vault'}`,
            flacPath
        ];

        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120000 });

        if (!fs.existsSync(flacPath) || fs.statSync(flacPath).size === 0) {
            throw new Error('FFmpeg failed to produce FLAC file');
        }

        const fileStats = fs.statSync(flacPath);
        const sizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
        console.log(`[Telegram FLAC Vault] FLAC generated (${sizeMB} MB). Uploading to Telegram channel...`);

        const fileBuffer = fs.readFileSync(flacPath);
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('audio', new Blob([fileBuffer], { type: 'audio/flac' }), flacFileName);
        formData.append('title', track.title || 'Unknown Title');
        formData.append('performer', track.artist || 'Unknown Artist');
        formData.append('caption', `⚡ HAZE Lossless FLAC Vault\n🎵 ${track.title} — ${track.artist}\n💿 Quality: 16-bit / 44.1 kHz FLAC (1,411 kbps)\n📦 Size: ${sizeMB} MB`);

        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`, {
            method: 'POST',
            body: formData,
        });

        const tgJson = await tgRes.json();
        if (!tgJson.ok) {
            console.error('[Telegram FLAC Vault] Telegram upload error:', tgJson.description);
            return null;
        }

        const messageId = tgJson.result?.message_id;
        console.log(`[Telegram FLAC Vault] Successfully archived "${track.title}" to Telegram (Msg ID: ${messageId})`);

        const vaultTrack = {
            id: trackId,
            title: track.title,
            artist: track.artist || 'Unknown Artist',
            album: track.album || 'Single',
            cover: track.cover || '',
            duration: track.duration || 216,
            isHiRes: true,
            qualityLabel: '1,411 kbps · FLAC Master',
            gradient: ['#7C5CFF', '#FF5C9E'],
            inVault: true,
            telegramMessageId: messageId,
            telegramChatId: TELEGRAM_CHAT_ID,
            savedAt: new Date().toISOString(),
        };

        const vault = loadVault();
        const idx = vault.findIndex(t => String(t.id) === trackId);
        if (idx >= 0) {
            vault[idx] = vaultTrack;
        } else {
            vault.unshift(vaultTrack);
        }
        saveVault(vault);

        return vaultTrack;
    } catch (err) {
        console.error('[Telegram FLAC Vault] Error archiving track:', err.message);
        return null;
    } finally {
        archivingSet.delete(trackId);
        if (fs.existsSync(flacPath)) {
            try { fs.unlinkSync(flacPath); } catch (e) {}
        }
    }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-memory cache for stream URLs
const streamCache = new Map();
const STREAM_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Clean strings for search queries
 */
function cleanQuery(str = '') {
    return str
        .replace(/\(.*?remaster.*?\)/gi, '')
        .replace(/\[.*?remaster.*?\]/gi, '')
        .replace(/\(feat\..*?\)/gi, '')
        .replace(/\[feat\..*?\)/gi, '')
        .trim();
}

/**
 * Parse LRC synced lyrics format into timestamped array
 */
function parseLrc(lrcText = '') {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    for (const line of lines) {
        const match = line.match(timeRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const fraction = parseFloat(`0.${match[3]}`);
            const time = minutes * 60 + seconds + fraction;
            const text = match[4].trim();
            if (text) {
                result.push({ time, text });
            }
        }
    }
    return result.sort((a, b) => a.time - b.time);
}

/**
 * 1. Search tracks & albums via iTunes
 */
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.json({ tracks: [] });
    }

    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=30`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`iTunes search failed: ${response.status}`);
        }
        const data = await response.json();
        const tracks = (data.results || []).map((item) => ({
            id: String(item.trackId),
            title: item.trackName || 'Unknown Title',
            artist: item.artistName || 'Unknown Artist',
            album: item.collectionName || 'Single',
            cover: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg') : '',
            coverLarge: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg') : '',
            duration: Math.round((item.trackTimeMillis || 0) / 1000),
            year: item.releaseDate ? item.releaseDate.substring(0, 4) : '',
            genre: item.primaryGenreName || 'Music',
            isrc: item.isrc || null,
        }));

        res.json({ tracks });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Failed to search tracks', details: err.message });
    }
});

/**
 * 2. Trending / Featured tracks for Home page
 */
app.get('/api/trending', async (req, res) => {
    try {
        const url = 'https://itunes.apple.com/us/rss/topsongs/limit=30/json';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Trending request failed: ${response.status}`);
        }
        const data = await response.json();
        const entries = data.feed?.entry || [];
        const tracks = entries.map((entry, index) => {
            const rawImage = entry['im:image']?.[2]?.label || '';
            const cover = rawImage ? rawImage.replace(/\/\d+x\d+bb\.png/, '/600x600bb.jpg') : '';
            const coverLarge = rawImage ? rawImage.replace(/\/\d+x\d+bb\.png/, '/1000x1000bb.jpg') : '';
            return {
                id: entry.id?.attributes?.['im:id'] || `trend-${index}`,
                title: entry['im:name']?.label || 'Unknown Title',
                artist: entry['im:artist']?.label || 'Unknown Artist',
                album: entry['im:collection']?.['im:name']?.label || 'Single',
                cover,
                coverLarge,
                duration: 210, // Default duration placeholder
                year: '2026',
                genre: entry.category?.attributes?.label || 'Popular',
            };
        });

        res.json({ tracks });
    } catch (err) {
        console.error('Trending error:', err);
        res.status(500).json({ error: 'Failed to fetch trending tracks', details: err.message });
    }
});

/**
 * 3. Resolve direct audio stream using ytmusicapi (official studio master) + yt-dlp
 */
async function resolveTrackAudio(artist = '', title = '', query = '') {
    const cleanArtist = cleanQuery(artist);
    const cleanTitle = cleanQuery(title);
    const searchQuery = cleanQuery(query || `${cleanArtist} ${cleanTitle}`);

    if (!searchQuery) {
        throw new Error('Missing search query or artist/title');
    }

    const cacheKey = searchQuery.toLowerCase();
    const cached = streamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < STREAM_CACHE_TTL) {
        return cached.data;
    }

    let videoId = null;

    // Step 1: Use ytmusicapi to find official studio release
    if (cleanArtist && cleanTitle) {
        try {
            const resolverScript = path.join(__dirname, 'resolve_track.py');
            const { stdout: pyOut } = await execFileAsync('python3', [resolverScript, cleanArtist, cleanTitle], { timeout: 7000 });
            const parsed = JSON.parse(pyOut.trim() || '{}');
            if (parsed.videoId) {
                videoId = parsed.videoId;
                console.log(`[Stream Resolver] Matched official studio track: "${parsed.title}" by ${parsed.artist} (${videoId})`);
            }
        } catch (err) {
            console.warn('[Stream Resolver] ytmusicapi lookup warning:', err.message);
        }
    }

    // Step 2: Target official videoId or fallback to studio audio search
    const targetUrl = videoId
        ? `https://www.youtube.com/watch?v=${videoId}`
        : `ytsearch1:${searchQuery} official studio audio`;

    const args = [
        '-f', '251/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '--audio-quality', '0',
        '-g',
        targetUrl,
        '--no-playlist',
        '--no-warnings',
    ];

    const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 15000 });
    const streamUrl = stdout.trim().split('\n')[0];

    if (!streamUrl || !streamUrl.startsWith('http')) {
        throw new Error('No valid stream URL returned by resolver');
    }

    const data = {
        streamUrl,
        proxyUrl: `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}`,
        quality: 'Studio Master 48kHz',
        format: 'Opus 48kHz (Official Studio)',
        bitrate: '256 kbps VBR',
        isStudioMaster: true,
    };

    streamCache.set(cacheKey, { timestamp: Date.now(), data });
    return data;
}

app.get('/api/stream', async (req, res) => {
    const { artist = '', title = '', query = '', id = '', duration = '', cover = '', album = '' } = req.query;
    try {
        const data = await resolveTrackAudio(artist, title, query);
        res.json(data);

        // Auto-archive in background to Telegram FLAC Vault if configured
        if (AUTO_ARCHIVE_TG && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && data.streamUrl) {
            const trackObj = {
                id: id || `${artist}_${title}`.replace(/[^a-zA-Z0-9]/g, '_'),
                title: title || query || 'Unknown Title',
                artist: artist || 'Unknown Artist',
                album: album || 'HAZE FLAC Vault',
                cover: cover || '',
                duration: Number(duration) || 216,
            };
            archiveTrackToTelegram(trackObj, data.streamUrl).catch(e => {
                console.warn('[Auto Archive TG] Background error:', e.message);
            });
        }
    } catch (err) {
        console.error('Stream resolution error:', err);
        res.status(500).json({ error: 'Failed to resolve audio stream', details: err.message });
    }
});

/**
 * 4. Stream audio proxy with Range support (bypasses CORS & automatically follows redirects)
 */
app.all('/api/proxy-stream', (req, res) => {
    const initialUrl = req.query.url;
    if (!initialUrl) {
        return res.status(400).send('Missing target URL');
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (req.headers.range) {
        headers['range'] = req.headers.range;
    }

    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';

    function fetchStream(currentUrl, redirectCount = 0) {
        if (redirectCount > 5) {
            return res.status(508).send('Too many redirects');
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(currentUrl);
        } catch (e) {
            return res.status(400).send('Invalid target URL');
        }

        const client = parsedUrl.protocol === 'https:' ? https : http;

        const proxyReq = client.request(currentUrl, { headers, method }, (proxyRes) => {
            // Automatically follow redirects from Google Video CDN
            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                const nextUrl = new URL(proxyRes.headers.location, currentUrl).toString();
                return fetchStream(nextUrl, redirectCount + 1);
            }

            res.status(proxyRes.statusCode);

            const allowedHeaders = [
                'content-type',
                'content-length',
                'accept-ranges',
                'content-range',
                'last-modified',
                'cache-control',
                'etag',
            ];

            for (const h of allowedHeaders) {
                if (proxyRes.headers[h]) {
                    res.setHeader(h, proxyRes.headers[h]);
                }
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'Range');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

            if (method === 'HEAD') {
                return res.end();
            }

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy stream error:', err);
            if (!res.headersSent) {
                res.status(502).send('Upstream stream error');
            }
        });

        req.on('close', () => {
            proxyReq.destroy();
        });

        proxyReq.end();
    }

    fetchStream(initialUrl);
});


/**
 * 5. Synced Lyrics via LRCLIB
 */
app.get('/api/lyrics', async (req, res) => {
    const { artist = '', title = '', duration = '' } = req.query;
    if (!title) {
        return res.status(400).json({ error: 'Missing track title' });
    }

    try {
        let lrcData = null;

        // Try exact match first
        const exactUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${duration || ''}`;
        const exactRes = await fetch(exactUrl, {
            headers: { 'User-Agent': 'MonochromePlayer/1.0 (https://github.com/monochrome-music)' },
        });

        if (exactRes.ok) {
            lrcData = await exactRes.json();
        } else {
            // Fallback to fuzzy search
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
            const searchRes = await fetch(searchUrl, {
                headers: { 'User-Agent': 'MonochromePlayer/1.0' },
            });
            if (searchRes.ok) {
                const searchResults = await searchRes.json();
                if (Array.isArray(searchResults) && searchResults.length > 0) {
                    lrcData = searchResults[0];
                }
            }
        }

        if (!lrcData) {
            return res.json({ synced: [], plain: 'No lyrics found for this song.' });
        }

        const synced = parseLrc(lrcData.syncedLyrics);
        res.json({
            synced,
            plain: lrcData.plainLyrics || '',
            hasSync: synced.length > 0,
        });
    } catch (err) {
        console.error('Lyrics error:', err);
        res.status(500).json({ error: 'Failed to fetch lyrics', details: err.message });
    }
});

/**
 * 5. Cloud Vault Endpoints (Cloudflare R2 Integration)
 */
app.get('/api/vault/list', (req, res) => {
    const vault = loadVault();
    // Default demo tracks if vault is empty
    const tracks = vault.length > 0 ? vault : [
        {
            id: 'track-1',
            title: 'Midnight Drive',
            artist: 'Nova Lane',
            album: 'Neon Horizon',
            duration: 216,
            isHiRes: true,
            qualityLabel: '48 kHz · Cloud Vault',
            gradient: ['#7C5CFF', '#FF5C9E'],
            inVault: true,
        },
        {
            id: 'track-2',
            title: 'Glass Hours',
            artist: 'Kite & Ember',
            album: 'Reflections',
            duration: 194,
            isHiRes: true,
            qualityLabel: '48 kHz · Cloud Vault',
            gradient: ['#FF9A3C', '#FF3C6E'],
            inVault: true,
        },
        {
            id: 'track-3',
            title: 'Low Tide',
            artist: 'Sora Vale',
            album: 'Deep Water',
            duration: 242,
            isHiRes: true,
            qualityLabel: '48 kHz · Cloud Vault',
            gradient: ['#18C8A8', '#2A6BFF'],
            inVault: true,
        },
        {
            id: 'track-4',
            title: 'Golden Static',
            artist: 'The Hollows',
            album: 'Signal Lost',
            duration: 188,
            isHiRes: true,
            qualityLabel: '48 kHz · Cloud Vault',
            gradient: ['#F5B942', '#C2410C'],
            inVault: true,
        },
        {
            id: 'track-5',
            title: 'Paper Planes',
            artist: 'Iris Moon',
            album: 'Skylines',
            duration: 205,
            isHiRes: true,
            qualityLabel: '48 kHz · Cloud Vault',
            gradient: ['#3B3B5C', '#8B7CFF'],
            inVault: true,
        },
    ];

    const estimatedBytes = tracks.length * 4.5 * 1024 * 1024; // ~4.5MB per Opus 48kHz track
    const storageUsedMB = (estimatedBytes / (1024 * 1024)).toFixed(1);
    const storageUsedDisplay = tracks.length > 5 ? `${(storageUsedMB / 1024).toFixed(2)} GB` : '1.4 GB';

    res.json({
        tracks,
        storageUsed: storageUsedDisplay,
        storageTotal: '10 GB',
        count: tracks.length,
        hasR2: !!r2Client,
    });
});

app.post('/api/vault/save', async (req, res) => {
    const { id, title, artist, album, cover, duration } = req.body;
    if (!id || !title) {
        return res.status(400).json({ error: 'Missing track details' });
    }

    try {
        console.log(`[Cloud Vault] Saving track: "${title}" by ${artist}`);

        // Resolve stream
        let streamUrl = null;
        try {
            const resolved = await resolveTrackAudio(artist, title);
            streamUrl = resolved.streamUrl;
        } catch (e) {
            console.warn('[Cloud Vault] Stream resolve failed, continuing with direct save:', e.message);
        }

        // Archive to Telegram FLAC Vault if configured
        let telegramMessageId = null;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && streamUrl) {
            try {
                const tgArchived = await archiveTrackToTelegram({ id, title, artist, album, cover, duration }, streamUrl);
                if (tgArchived) {
                    telegramMessageId = tgArchived.telegramMessageId;
                }
            } catch (tgErr) {
                console.error('[Cloud Vault] Telegram FLAC archiver error:', tgErr.message);
            }
        }

        let cloudUrl = null;
        if (r2Client && streamUrl) {
            try {
                // Stream directly into R2
                const response = await fetch(streamUrl);
                if (response.ok && response.body) {
                    const uploader = new Upload({
                        client: r2Client,
                        params: {
                            Bucket: R2_BUCKET_NAME,
                            Key: `tracks/${id}.opus`,
                            Body: response.body,
                            ContentType: 'audio/ogg',
                        },
                    });
                    await uploader.done();
                    cloudUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/tracks/${id}.opus` : `r2://${R2_BUCKET_NAME}/tracks/${id}.opus`;
                    console.log(`[Cloud Vault] Uploaded to R2: ${cloudUrl}`);
                }
            } catch (r2Err) {
                console.error('[Cloud Vault] R2 upload error:', r2Err);
            }
        }

        const newTrack = {
            id,
            title,
            artist: artist || 'Unknown Artist',
            album: album || 'Single',
            cover: cover || '',
            duration: duration || 216,
            isHiRes: true,
            qualityLabel: telegramMessageId ? '1,411 kbps · FLAC Master' : '48 kHz · Cloud Vault',
            gradient: ['#7C5CFF', '#FF5C9E'],
            inVault: true,
            telegramMessageId,
            cloudUrl,
            savedAt: new Date().toISOString(),
        };

        const vault = loadVault();
        const existingIdx = vault.findIndex(t => String(t.id) === String(id));
        if (existingIdx >= 0) {
            vault[existingIdx] = newTrack;
        } else {
            vault.unshift(newTrack);
        }
        saveVault(vault);

        res.json({
            success: true,
            track: newTrack,
            message: telegramMessageId ? 'Archived as FLAC to Telegram Vault' : 'Saved to Cloud Vault',
        });
    } catch (err) {
        console.error('Vault save error:', err);
        res.status(500).json({ error: 'Failed to save to Cloud Vault', details: err.message });
    }
});


// Serve frontend static build if dist exists
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`[Monochrome Player] Running on http://localhost:${PORT}`);
});
