import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import CryptoJS from 'crypto-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import bigInt from 'big-integer';

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
const TELEGRAM_API_ID = process.env.TELEGRAM_API_ID || '';
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || '';
const TELEGRAM_USER_SESSION = process.env.TELEGRAM_USER_SESSION || '';
const AUTO_ARCHIVE_TG = process.env.AUTO_ARCHIVE_TG !== 'false';

if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log('[Telegram FLAC Vault] Connected to Telegram channel:', TELEGRAM_CHAT_ID);
} else {
    console.log('[Telegram FLAC Vault] Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render to auto-archive FLACs.');
}

if (TELEGRAM_USER_SESSION) {
    console.log('[Telegram Userbot] Userbot session configured for automated FLAC scraping.');
} else {
    console.log('[Telegram Userbot] Run "node generate_session.js" to enable automated bot-to-bot FLAC fetching.');
}

// GramJS MTProto Client for Telegram streaming with zero 20 MB cap
let tgClient = null;
let tgClientConnecting = false;

async function getTelegramClient() {
    if (tgClient) return tgClient;
    if (tgClientConnecting) {
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (tgClient) return tgClient;
        }
    }
    if (!TELEGRAM_BOT_TOKEN) return null;

    tgClientConnecting = true;
    try {
        const apiIdNum = parseInt(TELEGRAM_API_ID, 10) || 19300364;
        const client = new TelegramClient(new StringSession(''), apiIdNum, TELEGRAM_API_HASH, {
            connectionRetries: 5,
            timeout: 30,
        });
        await client.start({
            botAuthToken: TELEGRAM_BOT_TOKEN,
        });
        tgClient = client;
        console.log('[GramJS MTProto] Connected successfully as Bot to MTProto client!');
        return tgClient;
    } catch (e) {
        console.warn('[GramJS MTProto] Bot MTProto connection warning:', e.message);
        return null;
    } finally {
        tgClientConnecting = false;
    }
}

// GramJS User Client for automated bot-to-bot interaction
let tgUserClient = null;
let tgUserConnecting = false;

async function getTelegramUserClient() {
    if (tgUserClient) return tgUserClient;
    if (!TELEGRAM_USER_SESSION) return null;
    if (tgUserConnecting) {
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (tgUserClient) return tgUserClient;
        }
    }

    tgUserConnecting = true;
    try {
        const apiIdNum = parseInt(TELEGRAM_API_ID, 10) || 19300364;
        const client = new TelegramClient(new StringSession(TELEGRAM_USER_SESSION), apiIdNum, TELEGRAM_API_HASH, {
            connectionRetries: 5,
        });
        await client.connect();
        tgUserClient = client;
        console.log('[GramJS Userbot] User account connected via MTProto successfully!');
        return tgUserClient;
    } catch (e) {
        console.warn('[GramJS Userbot] User client connection error:', e.message);
        return null;
    } finally {
        tgUserConnecting = false;
    }
}

/**
 * Automatically request bit-perfect FLAC from @deezload2bot and post directly to private channel
 */
const flacFetchingSet = new Set();
async function fetchFlacFromTelegramBot(track) {
    if (!TELEGRAM_USER_SESSION || !TELEGRAM_CHAT_ID) return null;
    const userClient = await getTelegramUserClient();
    if (!userClient) return null;

    const queryKey = `${track.title} ${track.artist}`.trim();
    if (flacFetchingSet.has(queryKey)) return null;
    flacFetchingSet.add(queryKey);

    console.log(`[Telegram Userbot] Requesting bit-perfect FLAC for "${queryKey}" from @deezload2bot...`);

    try {
        const targetBot = '@deezload2bot';
        const channelPeer = TELEGRAM_CHAT_ID.startsWith('-100') ? Number(TELEGRAM_CHAT_ID) : TELEGRAM_CHAT_ID;

        const query = `${track.artist} ${track.title}`.trim();
        const results = await userClient.invoke(new Api.messages.GetInlineBotResults({
            bot: targetBot,
            peer: channelPeer,
            query: query,
            offset: '',
        }));

        if (results.results && results.results.length > 0) {
            const normTitle = (track.title || '').toLowerCase().trim();
            const normArtist = (track.artist || '').toLowerCase().trim();

            // Prioritize exact match where description contains artist and title contains track title
            const matched = results.results.find(r => {
                const desc = (r.description || '').toLowerCase();
                const title = (r.title || '').toLowerCase();
                return desc.includes(normArtist) && (title.includes(normTitle) || normTitle.includes(title));
            }) || results.results.find(r => {
                const title = (r.title || '').toLowerCase();
                return title.includes(normTitle) || normTitle.includes(title);
            }) || results.results[0];

            console.log(`[Telegram Userbot] Found best FLAC match: "${matched.title}" (${matched.description?.replace(/\n/g, ' ') || ''}) [ID: ${matched.id}]. Posting to channel...`);

            await userClient.invoke(new Api.messages.SendInlineBotResult({
                peer: channelPeer,
                queryId: results.queryId,
                id: matched.id,
            }));

            console.log(`[Telegram Userbot] Successfully posted bit-perfect FLAC to channel ${TELEGRAM_CHAT_ID}!`);

            setTimeout(() => {
                streamCache.clear();
                syncTelegramChannelFiles().catch(() => {});
            }, 3500);

            return matched.id;
        } else {
            console.log(`[Telegram Userbot] No inline results returned for "${queryKey}".`);
        }
    } catch (err) {
        if (err.message && err.message.includes('AUTH_KEY_DUPLICATED')) {
            tgUserClient = null;
        }
        console.warn(`[Telegram Userbot] Error fetching FLAC:`, err.message);
    } finally {
        flacFetchingSet.delete(queryKey);
    }
    return null;
}

/**
 * Scan & Index all genuine FLAC / audio files from Telegram channel
 */
async function syncTelegramChannelFiles() {
    if (!TELEGRAM_CHAT_ID) return loadVault();
    const userClient = await getTelegramUserClient();
    if (!userClient) {
        return loadVault();
    }

    try {
        const channelPeer = TELEGRAM_CHAT_ID.startsWith('-100') ? Number(TELEGRAM_CHAT_ID) : TELEGRAM_CHAT_ID;
        console.log(`[GramJS MTProto] Indexing audio files from channel ${channelPeer}...`);
        const messages = await userClient.getMessages(channelPeer, { limit: 100 });
        const vault = loadVault();
        let addedCount = 0;

        for (const msg of messages) {
            if (!msg.media) continue;
            const doc = msg.media.document;
            if (!doc) continue;

            const isAudio = doc.mimeType?.startsWith('audio/') || doc.attributes?.some(a => a.className === 'DocumentAttributeAudio');
            const audioAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeAudio');

            if (isAudio) {
                const title = audioAttr?.title || (msg.message ? msg.message.split('\n')[1]?.replace('🎵', '').trim() : '') || `Track #${msg.id}`;
                const artist = audioAttr?.performer || 'Unknown Artist';
                const duration = audioAttr?.duration || 210;
                const isFlac = doc.mimeType?.includes('flac') || doc.mimeType?.includes('x-flac') || doc.attributes?.some(a => a.fileName?.toLowerCase().endsWith('.flac'));

                const trackId = `tg_${msg.id}`;
                const existingIdx = vault.findIndex(t => t.telegramMessageId === msg.id || (t.title?.toLowerCase() === title.toLowerCase() && t.artist?.toLowerCase() === artist.toLowerCase()));

                const trackObj = {
                    id: trackId,
                    title,
                    artist,
                    album: 'HAZE FLAC Vault',
                    duration,
                    fileSize: Number(doc.size) || 0,
                    isHiRes: true,
                    isFlac: !!isFlac,
                    qualityLabel: isFlac ? '1,411 kbps · Pure Lossless FLAC Master' : '320 kbps · Studio Audio',
                    telegramMessageId: msg.id,
                    telegramChatId: TELEGRAM_CHAT_ID,
                    streamUrl: `/api/tg-stream/${msg.id}`,
                    cover: (existingIdx >= 0 && vault[existingIdx].cover) ? vault[existingIdx].cover : 'https://c.saavncdn.com/372/b7f9937fefd686876e90be4a96c9a6e9_500x500.jpg',
                    gradient: ['#7C5CFF', '#FF5C9E'],
                    inVault: true,
                    savedAt: new Date(msg.date * 1000).toISOString(),
                };

                if (existingIdx >= 0) {
                    vault[existingIdx] = { ...vault[existingIdx], ...trackObj };
                } else {
                    vault.unshift(trackObj);
                    addedCount++;
                }
            }
        }

        saveVault(vault);
        console.log(`[GramJS MTProto] Channel sync completed. Total tracks in vault: ${vault.length} (indexed ${addedCount} new)`);
        return vault;
    } catch (err) {
        console.error('[GramJS MTProto] Error indexing channel files:', err.message);
        return loadVault();
    }
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

    // Strict check: if already in vault or Telegram channel, NEVER re-upload
    const currentVault = loadVault();
    const normTitle = (track.title || '').trim().toLowerCase();
    const normArtist = (track.artist || '').trim().toLowerCase();
    const existing = currentVault.find(t => {
        if (!t.telegramMessageId) return false;
        if (String(t.id) === trackId) return true;
        const tTitle = (t.title || '').trim().toLowerCase();
        const tArtist = (t.artist || '').trim().toLowerCase();
        return tTitle === normTitle && tArtist === normArtist;
    });

    if (existing) {
        console.log(`[Telegram FLAC Vault] Track "${track.title}" by ${track.artist} is already in the channel (Msg ID: ${existing.telegramMessageId}) - skipping re-upload.`);
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

app.get(['/health', '/api/health'], (req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

/**
 * 1. Search tracks & albums via JioSaavn + iTunes
 */
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || !query.trim()) {
        return res.json({ topResult: null, popularTracks: [], otherTracks: [], tracks: [] });
    }

    try {
        const cleanQ = query.trim();
        const resultsMap = new Map();

        // 1. Concurrent fetching: Autocomplete, JioSaavn search, iTunes search
        const autoUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&api_version=4&ctx=web6dot0&query=${encodeURIComponent(cleanQ)}`;
        const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=30&p=1&q=${encodeURIComponent(cleanQ)}`;
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&entity=song&limit=25`;

        const [autoRes, saavnRes, itunesRes] = await Promise.all([
            fetch(autoUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' } }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(saavnUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' } }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(itunesUrl).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        let topResult = null;
        let artistPopularTracks = [];

        // Check if query points directly to an Artist or specific entity
        const topEntity = autoRes?.topquery?.data?.[0];
        if (topEntity && topEntity.type === 'artist' && topEntity.id) {
            try {
                const artistDetailsUrl = `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&_marker=0&api_version=4&ctx=web6dot0&artistId=${topEntity.id}&n_song=15&n_album=6`;
                const artRes = await fetch(artistDetailsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.ok ? r.json() : null).catch(() => null);

                if (artRes && artRes.topSongs && artRes.topSongs.length > 0) {
                    artistPopularTracks = artRes.topSongs.map(item => {
                        const title = item.title ? item.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&') : '';
                        const artist = item.more_info?.artistMap?.primary_artists?.[0]?.name || topEntity.title;
                        const album = item.more_info?.album || 'Single';
                        const cover = item.image ? item.image.replace('150x150', '500x500') : '';
                        return {
                            id: `saavn-${item.id}`,
                            title: title || 'Unknown Title',
                            artist: artist || 'Unknown Artist',
                            album,
                            cover,
                            coverLarge: cover,
                            duration: Number(item.more_info?.duration) || 210,
                            year: item.year || '',
                            genre: item.language || 'Music',
                            source: 'jiosaavn'
                        };
                    });

                    topResult = {
                        type: 'artist',
                        id: topEntity.id,
                        name: topEntity.title,
                        subtitle: `${topEntity.description || 'Artist'} · ${artRes.follower_count ? (Number(artRes.follower_count) / 1000000).toFixed(1) + 'M Followers' : 'Popular Artist'}`,
                        cover: (topEntity.image || '').replace('50x50', '500x500').replace('150x150', '500x500'),
                        followerCount: artRes.follower_count || null
                    };
                }
            } catch (e) {
                console.warn('[Search] Artist details error:', e.message);
            }
        }

        // Add artist popular tracks first to the results map
        for (const track of artistPopularTracks) {
            const key = `${track.title.toLowerCase().trim()}_${track.artist.toLowerCase().trim()}_${track.album.toLowerCase().trim()}`;
            resultsMap.set(key, track);
        }

        // Process JioSaavn search results
        if (saavnRes?.results) {
            for (const item of saavnRes.results) {
                const title = item.title ? item.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&') : '';
                const artist = item.more_info?.artistMap?.primary_artists?.[0]?.name || item.subtitle || 'Unknown Artist';
                const album = item.more_info?.album || 'Single';
                const cover = item.image ? item.image.replace('150x150', '500x500') : '';
                const key = `${title.toLowerCase().trim()}_${artist.toLowerCase().trim()}_${album.toLowerCase().trim()}`;
                if (!resultsMap.has(key)) {
                    resultsMap.set(key, {
                        id: `saavn-${item.id}`,
                        title: title || 'Unknown Title',
                        artist: artist || 'Unknown Artist',
                        album,
                        cover,
                        coverLarge: cover,
                        duration: Number(item.more_info?.duration) || 210,
                        year: item.year || '',
                        genre: item.language || 'Music',
                        source: 'jiosaavn'
                    });
                }
            }
        }

        // Process iTunes search results
        if (itunesRes?.results) {
            for (const item of itunesRes.results) {
                const title = item.trackName || '';
                const artist = item.artistName || '';
                const album = item.collectionName || 'Single';
                const key = `${title.toLowerCase().trim()}_${artist.toLowerCase().trim()}_${album.toLowerCase().trim()}`;
                if (!resultsMap.has(key)) {
                    resultsMap.set(key, {
                        id: String(item.trackId),
                        title: title || 'Unknown Title',
                        artist: artist || 'Unknown Artist',
                        album,
                        cover: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg') : '',
                        coverLarge: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg') : '',
                        duration: Math.round((item.trackTimeMillis || 0) / 1000),
                        year: item.releaseDate ? item.releaseDate.substring(0, 4) : '',
                        genre: item.primaryGenreName || 'Music',
                        isrc: item.isrc || null,
                        source: 'itunes'
                    });
                }
            }
        }

        const allTracks = Array.from(resultsMap.values());

        // Scoring function
        function scoreTrack(track, qText) {
            const q = qText.toLowerCase().trim();
            const t = (track.title || '').toLowerCase().trim();
            const a = (track.artist || '').toLowerCase().trim();
            const alb = (track.album || '').toLowerCase().trim();

            let score = 0;
            if (t === q) score += 120;
            else if (t.startsWith(q)) score += 70;
            else if (t.includes(q)) score += 40;

            if (a === q) score += 90;
            else if (a.startsWith(q)) score += 50;
            else if (a.includes(q)) score += 30;

            if (`${a} ${t}`.includes(q) || `${t} ${a}`.includes(q)) score += 40;

            // Authentic studio release boost
            if (alb && !alb.includes('remix') && !alb.includes('karaoke') && !alb.includes('tribute') && !alb.includes('cover')) {
                score += 25;
            }

            // Severe penalty for unwanted remixes / karaoke / tributes unless user searched for them
            const penaltyTerms = ['karaoke', 'tribute', 'piano cover', 'instrumental', 'acoustic cover', 'slowed', 'reverb', 'remix', 'ringtone'];
            for (const term of penaltyTerms) {
                if ((t.includes(term) || alb.includes(term)) && !q.includes(term)) {
                    score -= 60;
                }
            }
            return score;
        }

        // If not an artist top result, sort by score and determine top song
        if (!topResult && allTracks.length > 0) {
            allTracks.sort((a, b) => scoreTrack(b, cleanQ) - scoreTrack(a, cleanQ));
            const best = allTracks[0];
            topResult = {
                type: 'song',
                id: best.id,
                title: best.title,
                name: best.title,
                subtitle: `${best.artist} · ${best.album || 'Single'}`,
                cover: best.coverLarge || best.cover,
                track: best
            };
        } else if (artistPopularTracks.length > 0) {
            // Keep artist's top songs pinned at the top, then sort the remaining tracks
            const popularIds = new Set(artistPopularTracks.map(t => t.id));
            const remainingTracks = allTracks.filter(t => !popularIds.has(t.id));
            remainingTracks.sort((a, b) => scoreTrack(b, cleanQ) - scoreTrack(a, cleanQ));
            allTracks.length = 0;
            allTracks.push(...artistPopularTracks, ...remainingTracks);
        } else {
            allTracks.sort((a, b) => scoreTrack(b, cleanQ) - scoreTrack(a, cleanQ));
        }

        const popularTracks = allTracks.slice(0, 5);
        const otherTracks = allTracks.slice(5);

        res.json({
            topResult,
            popularTracks,
            otherTracks,
            tracks: allTracks
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Failed to search tracks', details: err.message });
    }
});

/**
 * 1.5. Spotify Public Playlist Scraper (Zero Auth / Zero API Key Required)
 */
app.get('/api/spotify/playlist', async (req, res) => {
    const rawUrl = req.query.url || '';
    if (!rawUrl || !rawUrl.trim()) {
        return res.status(400).json({ error: 'Missing Spotify playlist URL' });
    }

    try {
        const match = rawUrl.match(/playlist[/:]([a-zA-Z0-9]+)/);
        const playlistId = match ? match[1] : rawUrl.trim();

        const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
        const response = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!response.ok) {
            throw new Error(`Spotify returned HTTP ${response.status}`);
        }

        const html = await response.text();
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if (!nextDataMatch) {
            throw new Error('Could not parse Spotify playlist data');
        }

        const parsed = JSON.parse(nextDataMatch[1]);
        const entity = parsed.props?.pageProps?.state?.data?.entity;
        if (!entity) {
            throw new Error('Playlist data entity not found');
        }

        const playlistName = entity.name || 'Imported Spotify Playlist';
        const coverArt = entity.coverArt?.sources?.[0]?.url || '';
        const rawTracks = entity.trackList || [];

        const tracks = rawTracks.map((t, idx) => ({
            id: `sp-${playlistId}-${idx}`,
            title: t.title || 'Unknown Track',
            artist: t.subtitle || 'Unknown Artist',
            album: playlistName,
            cover: coverArt,
            duration: Math.round((t.duration || 210000) / 1000),
            isHiRes: true,
            qualityLabel: '320 kbps · Studio Master',
        }));

        res.json({
            id: `sp-${playlistId}`,
            name: playlistName,
            cover: coverArt,
            trackCount: tracks.length,
            tracks,
        });
    } catch (err) {
        console.error('Spotify playlist scrape error:', err.message);
        res.status(500).json({ error: 'Failed to import Spotify playlist', details: err.message });
    }
});

// In-memory cache for trending tracks
let trendingCache = { data: null, timestamp: 0 };
const TRENDING_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * 2. Trending / Featured tracks for Home page (Apple Music Top 50 + JioSaavn)
 */
app.get('/api/trending', async (req, res) => {
    if (trendingCache.data && (Date.now() - trendingCache.timestamp < TRENDING_CACHE_TTL)) {
        return res.json({ tracks: trendingCache.data });
    }

    try {
        const url = 'https://itunes.apple.com/us/rss/topsongs/limit=50/json';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Trending request failed: ${response.status}`);
        }
        const data = await response.json();
        const entries = data.feed?.entry || [];
        const tracks = entries.map((entry, index) => {
            const rawImage = entry['im:image']?.[2]?.label || '';
            const cover = rawImage ? rawImage.replace(/\/\d+x\d+bb\.(png|jpg)/, '/600x600bb.jpg') : '';
            const coverLarge = rawImage ? rawImage.replace(/\/\d+x\d+bb\.(png|jpg)/, '/1000x1000bb.jpg') : '';
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
                rank: index + 1,
            };
        });

        if (tracks.length > 0) {
            trendingCache = { data: tracks, timestamp: Date.now() };
        }
        res.json({ tracks });
    } catch (err) {
        console.error('Trending error:', err);
        if (trendingCache.data) {
            return res.json({ tracks: trendingCache.data });
        }
        res.status(500).json({ error: 'Failed to fetch trending tracks', details: err.message });
    }
});

/**
 * Direct JioSaavn 320kbps Studio Master resolver
 */
async function resolveJioSaavn(searchQuery) {
    try {
        const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=5&p=1&q=${encodeURIComponent(searchQuery)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        const results = data.results || [];
        if (results.length === 0) return null;

        const match = results[0];
        const enc = match.more_info?.encrypted_media_url;
        if (!enc) return null;

        const key = CryptoJS.enc.Utf8.parse('38346591');
        const decrypted = CryptoJS.DES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(enc) }, key, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8);

        if (!decrypted || !decrypted.startsWith('http')) return null;

        const stream320 = decrypted.replace(/_[0-9]+\.mp4$/, '_320.mp4');
        return {
            streamUrl: stream320,
            quality: 'Studio Master 320kbps',
            format: '320kbps Studio Master',
            bitrate: '320 kbps',
            isStudioMaster: true
        };
    } catch (e) {
        console.warn('[JioSaavn Resolver] error:', e.message);
        return null;
    }
}

/**
 * 3. Resolve direct audio stream using multi-strategy fallbacks
 */
async function resolveTrackAudio(artist = '', title = '', query = '', requestedQuality = '') {
    const cleanArtist = cleanQuery(artist);
    const cleanTitle = cleanQuery(title);
    const searchQuery = cleanQuery(query || `${cleanArtist} ${cleanTitle}`);

    if (!searchQuery) {
        throw new Error('Missing search query or artist/title');
    }

    const isFlacRequested = requestedQuality === 'flac' || requestedQuality === '1411k';
    const cacheKey = `${searchQuery.toLowerCase()}_${isFlacRequested ? 'flac' : 'studio'}`;

    const cached = streamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < STREAM_CACHE_TTL) {
        return cached.data;
    }

    // Strategy 0: Direct Telegram MTProto Lossless FLAC Master (Only when FLAC requested or default)
    if (isFlacRequested) {
        try {
            const vault = loadVault();
            const cleanCTitle = cleanTitle.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').trim();
            const cleanCArtist = cleanArtist.toLowerCase().split(',')[0].split('&')[0].trim();

            const vaultMatch = vault.find(t => {
                if (!t.telegramMessageId) return false;
                const tTitle = (t.title || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').trim();
                const tArtist = (t.artist || '').toLowerCase().split(',')[0].split('&')[0].trim();

                // Strictly avoid matching piano covers, karaoke, tribute unless user explicitly asked
                const isCoverInVault = (t.title || '').toLowerCase().includes('cover') || (t.artist || '').toLowerCase().includes('cover') || (t.title || '').toLowerCase().includes('piano');
                const isCoverQueried = cleanCTitle.includes('cover') || cleanCArtist.includes('cover') || cleanCTitle.includes('piano');
                if (isCoverInVault && !isCoverQueried) return false;

                if (cleanCTitle && tTitle) {
                    const titleMatch = tTitle === cleanCTitle || tTitle.startsWith(cleanCTitle) || cleanCTitle.startsWith(tTitle);
                    if (!titleMatch) return false;
                    if (!cleanCArtist) return true;
                    return tArtist === cleanCArtist || tArtist.includes(cleanCArtist) || cleanCArtist.includes(tArtist);
                }
                return false;
            });
            if (vaultMatch && vaultMatch.telegramMessageId) {
                console.log(`[Stream Resolver] Matched Telegram MTProto Lossless FLAC Master for: "${searchQuery}" (Msg ID: ${vaultMatch.telegramMessageId})`);
                const streamPath = `/api/tg-stream/${vaultMatch.telegramMessageId}`;

                // Resolve Saavn 320k stream concurrently as instant fallback
                let fallbackStreamUrl = null;
                try {
                    const saavnFallback = await resolveJioSaavn(searchQuery);
                    if (saavnFallback && saavnFallback.streamUrl) {
                        fallbackStreamUrl = saavnFallback.streamUrl;
                    }
                } catch (e) {}

                const data = {
                    streamUrl: streamPath,
                    proxyUrl: streamPath,
                    fallbackUrl: fallbackStreamUrl,
                    quality: vaultMatch.qualityLabel || '1,411 kbps · Pure Lossless FLAC Master',
                    format: '16-bit / 44.1 kHz FLAC Master',
                    bitrate: '1,411 kbps',
                    isFlac: true,
                    isStudioMaster: true,
                };
                streamCache.set(cacheKey, { timestamp: Date.now(), data });
                return data;
            }
        } catch (errTg) {
            console.warn('[Stream Resolver] Telegram Vault check warning:', errTg.message);
        }
    }

    // Strategy 1: Direct JioSaavn 320kbps Studio Master (lightning fast < 1s, zero cloud IP blocks)
    try {
        const saavnStream = await resolveJioSaavn(searchQuery);
        if (saavnStream && saavnStream.streamUrl) {
            console.log(`[Stream Resolver] Matched direct 320kbps Studio Master for: "${searchQuery}"`);
            const data = {
                streamUrl: saavnStream.streamUrl,
                proxyUrl: `/api/proxy-stream?url=${encodeURIComponent(saavnStream.streamUrl)}`,
                fallbackUrl: `/api/proxy-stream?url=${encodeURIComponent(saavnStream.streamUrl)}`,
                quality: saavnStream.quality || '320 kbps · Studio Master',
                format: saavnStream.format || 'AAC Studio Master',
                bitrate: saavnStream.bitrate || '320 kbps',
                isFlac: false,
                flacUnavailable: isFlacRequested,
                isStudioMaster: true,
            };
            streamCache.set(cacheKey, { timestamp: Date.now(), data });
            return data;
        }
    } catch (err0) {
        console.warn('[Stream Resolver] Strategy 1 (JioSaavn) warning:', err0.message);
    }

    let streamUrl = null;
    let quality = 'Studio Master';
    let format = 'HQ Master Audio';
    let bitrate = '256 kbps';

    // Strategy 2: YouTube official audio with default VisionOS client (fast, 6s timeout)
    try {
        const args = [
            '-f', '140/251/ba/b',
            '-g',
            `ytsearch1:${searchQuery} official audio`,
            '--no-playlist',
            '--no-warnings',
        ];
        const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 6000 });
        const lines = stdout.trim().split('\n').filter(l => l.startsWith('http'));
        if (lines.length > 0) {
            streamUrl = lines[0];
            quality = 'Studio Master 48kHz';
            format = 'Opus 48kHz';
        }
    } catch (err1) {
        console.warn('[Stream Resolver] Strategy 2 (YouTube) warning:', err1.message);
    }

    // Strategy 3: SoundCloud Studio Audio Fallback (fast, 6s timeout)
    if (!streamUrl) {
        try {
            console.log(`[Stream Resolver] Attempting SoundCloud fallback for: "${searchQuery}"`);
            const args = [
                '-f', 'bestaudio/b',
                '-g',
                `scsearch1:${searchQuery}`,
                '--no-playlist',
                '--no-warnings',
            ];
            const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 6000 });
            const lines = stdout.trim().split('\n').filter(l => l.startsWith('http'));
            if (lines.length > 0) {
                streamUrl = lines[0];
                format = 'HQ Master Audio';
                quality = 'Studio Master';
            }
        } catch (err2) {
            console.warn('[Stream Resolver] Strategy 3 (SoundCloud) warning:', err2.message);
        }
    }

    if (!streamUrl) {
        throw new Error('No valid stream URL returned by resolver');
    }

    const data = {
        streamUrl,
        proxyUrl: `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}`,
        quality,
        format,
        bitrate,
        isStudioMaster: true,
    };

    streamCache.set(cacheKey, { timestamp: Date.now(), data });
    return data;
}

app.get('/api/stream', async (req, res) => {
    const { artist = '', title = '', query = '', id = '', duration = '', cover = '', album = '', quality = '' } = req.query;
    try {
        const data = await resolveTrackAudio(artist, title, query, quality);
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

            // If userbot is configured, automatically fetch genuine FLAC from music downloader bot
            if (TELEGRAM_USER_SESSION) {
                fetchFlacFromTelegramBot(trackObj).catch(e => {
                    console.warn('[Userbot Fetch] Background error:', e.message);
                });
            }
        }
    } catch (err) {
        console.error('Stream resolution error:', err);
        res.status(500).json({ error: 'Failed to resolve audio stream', details: err.message });
    }
});

/**
 * 3.5. Direct MTProto Range Stream for Telegram Channel Lossless Audio (Zero 20MB limit!)
 */
app.get('/api/tg-stream/:messageId', async (req, res) => {
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId || !TELEGRAM_CHAT_ID) {
        return res.status(400).send('Invalid message ID or missing Telegram channel');
    }

    // Prefer Bot client for streaming: 100% stable, no duplicate session / auth key issues!
    let client = await getTelegramClient();
    if (!client) {
        client = await getTelegramUserClient();
    }
    if (!client) {
        return res.status(503).send('Telegram MTProto service not connected');
    }

    try {
        const channelPeer = TELEGRAM_CHAT_ID.startsWith('-100') ? Number(TELEGRAM_CHAT_ID) : TELEGRAM_CHAT_ID;
        let msg = null;
        try {
            const msgs = await client.getMessages(channelPeer, { ids: [messageId] });
            msg = msgs ? msgs[0] : null;
        } catch (clientErr) {
            console.warn(`[GramJS Stream] Primary client error: ${clientErr.message}. Trying fallback client...`);
            if (clientErr.message && clientErr.message.includes('AUTH_KEY_DUPLICATED')) {
                tgUserClient = null;
            }
            const fallback = client === tgClient ? await getTelegramUserClient() : await getTelegramClient();
            if (fallback) {
                client = fallback;
                const msgs = await client.getMessages(channelPeer, { ids: [messageId] });
                msg = msgs ? msgs[0] : null;
            } else {
                throw clientErr;
            }
        }
        if (!msg || !msg.media || !msg.media.document) {
            return res.status(404).send('Audio media not found in Telegram message');
        }

        const doc = msg.media.document;
        const totalSize = Number(doc.size);
        const mimeType = doc.mimeType || 'audio/flac';

        let start = 0;
        let end = totalSize - 1;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            start = parseInt(parts[0], 10);
            if (parts[1]) {
                end = parseInt(parts[1], 10);
            }
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        } else {
            res.status(200);
        }

        const chunkSize = end - start + 1;
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', chunkSize);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');

        let bytesSent = 0;
        for await (const chunk of client.iterDownload({
            file: msg.media,
            offset: bigInt(start),
            requestSize: 128 * 1024,
        })) {
            res.write(chunk);
            bytesSent += chunk.length;
            if (bytesSent >= chunkSize) {
                break;
            }
        }

        res.end();
    } catch (err) {
        console.error(`[GramJS Stream] Error streaming message ${messageId}:`, err.message);
        if (!res.headersSent) {
            try {
                const vault = loadVault();
                const vTrack = vault.find(t => t.telegramMessageId === messageId);
                const query = vTrack ? `${vTrack.artist} ${vTrack.title}` : `track ${messageId}`;
                const fallback = await resolveJioSaavn(query);
                if (fallback && fallback.streamUrl) {
                    console.log(`[GramJS Stream] Auto-recovering message ${messageId} via 320k fallback CDN: ${fallback.streamUrl}`);
                    return res.redirect(302, fallback.streamUrl);
                }
            } catch (fallbackErr) {
                console.warn('[GramJS Stream] Fallback resolution error:', fallbackErr.message);
            }
            res.status(500).send('Error streaming from Telegram');
        }
    }
});

/**
 * Sync Telegram channel audio files into HAZE Vault
 */
app.all('/api/vault/sync', async (req, res) => {
    try {
        const updatedVault = await syncTelegramChannelFiles();
        res.json({ success: true, count: updatedVault.length, tracks: updatedVault });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
 * 5. Synced Lyrics via LRCLIB + JioSaavn Fallback
 */
app.get('/api/lyrics', async (req, res) => {
    const rawTitle = req.query.title || req.query.track || '';
    const rawArtist = req.query.artist || '';
    const duration = req.query.duration || '';

    if (!rawTitle) {
        return res.status(400).json({ error: 'Missing track title' });
    }

    const cleanTitle = cleanQuery(rawTitle).replace(/\(.*?\)|\[.*?\]/g, '').trim();
    const cleanArtist = cleanQuery(rawArtist).split(',')[0].split('&')[0].trim();

    try {
        let lrcData = null;

        // 1. Exact match on LRCLIB
        try {
            const exactUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist || rawArtist)}&track_name=${encodeURIComponent(cleanTitle || rawTitle)}&duration=${duration || ''}`;
            const exactRes = await fetch(exactUrl, {
                headers: { 'User-Agent': 'HazePlayer/1.0 (https://github.com/Sahith69/haze)' },
            });
            if (exactRes.ok) {
                lrcData = await exactRes.json();
            }
        } catch (e) {}

        // 2. Fuzzy search on LRCLIB if exact match was empty
        if (!lrcData || (!lrcData.syncedLyrics && !lrcData.plainLyrics)) {
            try {
                const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim() || rawTitle)}`;
                const searchRes = await fetch(searchUrl, {
                    headers: { 'User-Agent': 'HazePlayer/1.0' },
                });
                if (searchRes.ok) {
                    const searchResults = await searchRes.json();
                    if (Array.isArray(searchResults) && searchResults.length > 0) {
                        lrcData = searchResults[0];
                    }
                }
            } catch (e) {}
        }

        if (lrcData && (lrcData.syncedLyrics || lrcData.plainLyrics)) {
            const synced = parseLrc(lrcData.syncedLyrics);
            return res.json({
                synced,
                plain: lrcData.plainLyrics || '',
                hasSync: synced.length > 0,
            });
        }

        // 3. Fallback: JioSaavn Lyrics API
        try {
            const saavnSearch = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=3&p=1&q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim() || rawTitle)}`;
            const sRes = await fetch(saavnSearch, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            });
            if (sRes.ok) {
                const sData = await sRes.json();
                const song = (sData.results || [])[0];
                if (song && song.id && song.more_info?.has_lyrics === 'true') {
                    const lyricsUrl = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&_format=json&ctx=web6dot0&lyrics_id=${song.id}`;
                    const lRes = await fetch(lyricsUrl);
                    if (lRes.ok) {
                        const lData = await lRes.json();
                        if (lData.lyrics) {
                            const plain = lData.lyrics.replace(/<br\s*[\/]?>/gi, '\n');
                            return res.json({
                                synced: [],
                                plain,
                                hasSync: false,
                            });
                        }
                    }
                }
            }
        } catch (sErr) {}

        res.json({ synced: [], plain: 'No lyrics available for this track.' });
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
    const tracks = Array.isArray(vault) ? vault : [];

    // Calculate real storage used in bytes based on actual tracks in vault (~28-35MB per lossless FLAC)
    const totalBytes = tracks.reduce((sum, t) => sum + (t.fileSize || 28 * 1024 * 1024), 0);
    const totalQuotaBytes = 10 * 1024 * 1024 * 1024; // 10 GB

    let storageUsedDisplay = '0 MB';
    if (totalBytes > 0) {
        if (totalBytes < 1024 * 1024 * 1024) {
            storageUsedDisplay = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            storageUsedDisplay = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
    }
    const percentUsed = totalBytes > 0 ? Math.min(100, Math.max(1, Math.round((totalBytes / totalQuotaBytes) * 100))) : 0;

    res.json({
        tracks,
        storageUsed: storageUsedDisplay,
        storageTotal: '10 GB',
        storagePercent: percentUsed,
        storageUsedBytes: totalBytes,
        storageTotalBytes: totalQuotaBytes,
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
    console.log(`[HAZE Player] Running on http://localhost:${PORT}`);
});
