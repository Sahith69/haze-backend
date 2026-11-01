import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  ListMusic,
  Mic2,
  Activity,
  Loader2,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function NowPlayingBar() {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    audioQuality,
    isFlac,
    isLyricsOpen,
    isVisualizerOpen,
    isQueueOpen,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    setIsShuffle,
    setRepeatMode,
    setIsLyricsOpen,
    setIsVisualizerOpen,
    setIsQueueOpen,
    toggleFavorite,
    isFavorite,
  } = usePlayer();

  const handleRepeatClick = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="h-22 bg-[#050505] border-t border-neutral-900 px-4 md:px-6 flex items-center justify-between select-none shrink-0 z-40 relative">
      {/* Left: Track Details */}
      <div className="flex items-center gap-3.5 w-1/4 min-w-[200px]">
        {currentTrack ? (
          <>
            <div className="relative group shrink-0 w-14 h-14 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 shadow-md">
              <img
                src={currentTrack.cover || 'https://via.placeholder.com/60'}
                alt={currentTrack.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-col min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate hover:underline cursor-pointer">
                  {currentTrack.title}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono tracking-tight shrink-0 border ${
                  isFlac
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-neutral-800 text-neutral-300 border-neutral-700/60'
                }`}>
                  {isFlac ? '⚡ FLAC' : '✨ 320k'}
                </span>
              </div>
              <span className="text-xs text-neutral-400 truncate hover:text-white cursor-pointer mt-0.5">
                {currentTrack.artist}
              </span>
            </div>
            <button
              onClick={() => toggleFavorite(currentTrack)}
              className="p-1.5 text-neutral-500 hover:text-white rounded-full transition-colors shrink-0"
              title={isFavorite(currentTrack.id) ? 'Remove from Favorites' : 'Add to Favorites'}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  isFavorite(currentTrack.id) ? 'fill-red-500 text-red-500' : 'hover:text-white'
                }`}
              />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-neutral-600 text-xs">
            <div className="w-14 h-14 rounded-md bg-neutral-900/60 border border-neutral-800/40 flex items-center justify-center">
              <Activity className="w-5 h-5 text-neutral-700" />
            </div>
            <span>No track playing</span>
          </div>
        )}
      </div>

      {/* Center: Controls & Progress */}
      <div className="flex flex-col items-center max-w-xl w-2/4 px-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-4 md:gap-5 mb-1.5">
          <button
            onClick={() => setIsShuffle((prev) => !prev)}
            className={`p-1.5 rounded-full transition-colors ${
              isShuffle ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title="Shuffle (S)"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={prevTrack}
            disabled={!currentTrack}
            className="p-1.5 text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
            title="Previous (Shift + ←)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            className="w-9 h-9 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.25)] disabled:opacity-40 disabled:hover:scale-100"
            title="Play / Pause (Space)"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black translate-x-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            disabled={!currentTrack}
            className="p-1.5 text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
            title="Next (Shift + →)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={handleRepeatClick}
            className={`p-1.5 rounded-full transition-colors ${
              repeatMode !== 'off' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex items-center gap-2.5 text-[11px] font-mono text-neutral-500 group">
          <span className="w-10 text-right shrink-0">{formatTime(currentTime)}</span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              disabled={!currentTrack}
              className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer z-10"
            />
            {/* Filled progress overlay */}
            <div
              className="absolute left-0 top-0 h-1 bg-white rounded-lg pointer-events-none transition-all group-hover:bg-neutral-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="w-10 text-left shrink-0">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Audio Badges, Lyrics, Visualizer, Volume */}
      <div className="flex items-center justify-end gap-3 w-1/4 min-w-[200px]">
        {/* Synced Lyrics Toggle Button */}
        <button
          onClick={() => setIsLyricsOpen((prev) => !prev)}
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border ${
            isLyricsOpen
              ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]'
              : 'bg-neutral-900/60 text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-800'
          }`}
          title="Synced Lyrics (L)"
        >
          <Mic2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px]">Lyrics</span>
        </button>

        {/* Audio Visualizer Toggle Button */}
        <button
          onClick={() => setIsVisualizerOpen((prev) => !prev)}
          className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border ${
            isVisualizerOpen
              ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]'
              : 'bg-neutral-900/60 text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-800'
          }`}
          title="Visualizer (V)"
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[11px]">Spectrum</span>
        </button>

        {/* Queue Toggle Button */}
        <button
          onClick={() => setIsQueueOpen((prev) => !prev)}
          className={`p-2 rounded-lg text-xs font-medium transition-all border ${
            isQueueOpen
              ? 'bg-white text-black border-white'
              : 'bg-neutral-900/60 text-neutral-400 hover:text-white border-neutral-800 hover:bg-neutral-800'
          }`}
          title="Queue (Q)"
        >
          <ListMusic className="w-4 h-4" />
        </button>

        {/* Volume Controls */}
        <div className="flex items-center gap-2 group ml-1">
          <button
            onClick={toggleMute}
            className="text-neutral-400 hover:text-white p-1 transition-colors"
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-neutral-500" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-18 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </footer>
  );
}
