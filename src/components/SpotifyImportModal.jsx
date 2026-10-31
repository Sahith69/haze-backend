import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, Music, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function SpotifyImportModal() {
  const { isSpotifyModalOpen, setIsSpotifyModalOpen, createPlaylist } = usePlayer();
  const [playlistName, setPlaylistName] = useState('My Spotify Playlist');
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedTracks, setParsedTracks] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');

  if (!isSpotifyModalOpen) return null;

  // Parse CSV (from Exportify) or plain lines
  const parseContent = (content) => {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const tracks = [];
    const firstLine = lines[0].toLowerCase();

    // Check if it's an Exportify / Spotify CSV
    if (firstLine.includes('track name') || firstLine.includes('title')) {
      const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
      const titleIdx = headers.findIndex((h) => h.includes('track name') || h.includes('title') || h === 'song');
      const artistIdx = headers.findIndex((h) => h.includes('artist'));
      const albumIdx = headers.findIndex((h) => h.includes('album'));

      for (let i = 1; i < lines.length; i++) {
        // Simple regex to parse CSV handling quoted commas
        const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
        const cleanRow = row.map((cell) => cell.replace(/^"|"$/g, '').trim());

        const title = cleanRow[titleIdx] || '';
        const artist = cleanRow[artistIdx] || 'Various Artists';
        const album = cleanRow[albumIdx] || 'Spotify Import';

        if (title) {
          tracks.push({
            id: `spot-${Date.now()}-${i}`,
            title,
            artist,
            album,
            cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=60',
            duration: 210,
            year: 'Spotify',
          });
        }
      }
    } else {
      // Plain lines like "Artist - Title" or "Title by Artist"
      lines.forEach((line, idx) => {
        let title = line;
        let artist = 'Various Artists';

        if (line.includes(' - ')) {
          const parts = line.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        } else if (line.includes(' by ')) {
          const parts = line.split(' by ');
          title = parts[0].trim();
          artist = parts[1].trim();
        }

        if (title) {
          tracks.push({
            id: `spot-${Date.now()}-${idx}`,
            title,
            artist,
            album: 'Spotify Import',
            cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=60',
            duration: 210,
            year: 'Spotify',
          });
        }
      });
    }

    return tracks;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const defaultName = file.name.replace(/\.[^/.]+$/, '');
    setPlaylistName(defaultName);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        const parsed = parseContent(content);
        setParsedTracks(parsed);
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setRawText(val);
    const parsed = parseContent(val);
    setParsedTracks(parsed);
  };

  const handleImport = () => {
    if (parsedTracks.length === 0) return;
    setIsProcessing(true);

    setTimeout(() => {
      createPlaylist(playlistName, parsedTracks);
      setIsProcessing(false);
      setSuccessMessage(`Successfully imported "${playlistName}" with ${parsedTracks.length} tracks!`);
      setTimeout(() => {
        setIsSpotifyModalOpen(false);
        setSuccessMessage('');
        setParsedTracks([]);
        setRawText('');
      }, 1500);
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="bg-[#111111] border border-neutral-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={() => setIsSpotifyModalOpen(false)}
          className="absolute right-5 top-5 text-neutral-500 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Import Spotify Playlist</h2>
            <p className="text-xs text-neutral-400">Upload an Exportify CSV or paste your song list</p>
          </div>
        </div>

        {/* Step 1: Playlist Name */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
            Playlist Name
          </label>
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            className="w-full bg-[#181818] border border-neutral-800 rounded-lg px-3.5 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>

        {/* Step 2: Upload CSV File */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
            Option A: Upload Exportify CSV
          </label>
          <label className="border-2 border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group">
            <FileText className="w-6 h-6 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
            <span className="text-xs text-neutral-400 group-hover:text-neutral-200">
              Click to select exported <code className="text-neutral-300">.csv</code> file
            </span>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Step 3: Or Paste Text */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
            Option B: Or Paste Track List
          </label>
          <textarea
            value={rawText}
            onChange={handleTextChange}
            placeholder="Coldplay - Yellow&#10;Adele - Someone Like You&#10;The Weeknd - Blinding Lights"
            rows="4"
            className="w-full bg-[#181818] border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
          />
        </div>

        {/* Track Count & Action Button */}
        {successMessage ? (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-2 border-t border-neutral-900">
            <span className="text-xs text-neutral-400 font-mono">
              {parsedTracks.length > 0 ? `${parsedTracks.length} tracks detected` : 'No tracks detected yet'}
            </span>
            <button
              onClick={handleImport}
              disabled={parsedTracks.length === 0 || isProcessing}
              className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-white flex items-center gap-2"
            >
              {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Import to Monochrome</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
