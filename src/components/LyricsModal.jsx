import React, { useEffect, useRef } from 'react';
import { X, Mic2, Loader2, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function LyricsModal() {
  const {
    currentTrack,
    isLyricsOpen,
    setIsLyricsOpen,
    lyricsData,
    isLoadingLyrics,
    activeLyricIndex,
    seek,
  } = usePlayer();

  const containerRef = useRef(null);
  const activeLineRef = useRef(null);

  // Auto-scroll active line into view smoothly
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLyricIndex]);

  if (!isLyricsOpen) return null;

  return (
    <div className="fixed inset-0 top-0 bottom-22 bg-black/95 backdrop-blur-2xl z-30 flex flex-col select-none animate-fadeIn">
      {/* Header bar */}
      <div className="h-16 px-8 flex items-center justify-between border-b border-neutral-900/60 shrink-0">
        <div className="flex items-center gap-3">
          <Mic2 className="w-4 h-4 text-white" />
          <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400 font-mono">
            Synced Lyrics
          </span>
        </div>
        <button
          onClick={() => setIsLyricsOpen(false)}
          className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-900 transition-colors"
          title="Close Lyrics (L or Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Lyrics Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-6xl w-full mx-auto p-6 md:p-12 gap-8 md:gap-16">
        {/* Left Side: Track Info Poster */}
        {currentTrack && (
          <div className="hidden md:flex flex-col items-start w-72 shrink-0 space-y-4 pt-8">
            <div className="w-64 h-64 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl">
              <img
                src={currentTrack.coverLarge || currentTrack.cover}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white tracking-tight">{currentTrack.title}</h2>
              <p className="text-sm text-neutral-400 font-medium">{currentTrack.artist}</p>
              <p className="text-xs text-neutral-600 font-mono pt-1">{currentTrack.album}</p>
            </div>
          </div>
        )}

        {/* Right Side: Scrolling Lyrics */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto lyrics-mask px-4 py-32 space-y-7 text-center md:text-left scroll-smooth"
        >
          {isLoadingLyrics ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span className="text-sm">Fetching lyrics...</span>
            </div>
          ) : !lyricsData || (lyricsData.synced.length === 0 && !lyricsData.plain) ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-3">
              <Music className="w-8 h-8 opacity-40" />
              <span className="text-base font-medium">No lyrics available for this song</span>
            </div>
          ) : lyricsData.synced.length > 0 ? (
            // Timestamped Synced Lyrics
            lyricsData.synced.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              const isPast = idx < activeLyricIndex;

              return (
                <p
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seek(line.time)}
                  className={`cursor-pointer transition-all duration-300 font-bold select-none leading-relaxed ${
                    isActive
                      ? 'text-white text-2xl md:text-3xl scale-102 translate-x-1 opacity-100 shadow-[0_0_30px_rgba(255,255,255,0.2)]'
                      : isPast
                      ? 'text-neutral-500 text-lg md:text-xl opacity-60 hover:text-neutral-300 hover:opacity-90'
                      : 'text-neutral-600 text-lg md:text-xl opacity-40 hover:text-neutral-300 hover:opacity-80'
                  }`}
                >
                  {line.text}
                </p>
              );
            })
          ) : (
            // Plain text lyrics fallback
            <div className="whitespace-pre-line text-lg text-neutral-300 leading-loose">
              {lyricsData.plain}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
