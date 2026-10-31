import React, { useState } from 'react';
import { Play, Pause, Heart, Plus, MoreHorizontal, Check, Volume2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function TrackList({ tracks = [], currentPlaylistId = null }) {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    toggleFavorite,
    isFavorite,
    playlists,
    addToPlaylist,
    removeFromPlaylist,
  } = usePlayer();

  const [activeMenuId, setActiveMenuId] = useState(null);

  const handleRowClick = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  };

  return (
    <div className="w-full text-left select-none">
      {/* Header Row */}
      <div className="grid grid-cols-[40px_1fr_1fr_80px_70px_50px] px-4 py-2.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-900">
        <span>#</span>
        <span>Title</span>
        <span className="hidden md:block">Album</span>
        <span className="hidden sm:block text-right">Year</span>
        <span className="text-right">Duration</span>
        <span className="text-center"></span>
      </div>

      {/* Track Rows */}
      <div className="divide-y divide-neutral-900/40">
        {tracks.map((track, idx) => {
          const isThisPlaying = currentTrack?.id === track.id;
          const isThisFav = isFavorite(track.id);

          return (
            <div
              key={`${track.id}-${idx}`}
              onClick={() => handleRowClick(track)}
              className={`grid grid-cols-[40px_1fr_1fr_80px_70px_50px] px-4 py-2.5 items-center rounded-lg group transition-colors cursor-pointer ${
                isThisPlaying ? 'bg-neutral-900/90 text-white' : 'hover:bg-neutral-900/50 text-neutral-300'
              }`}
            >
              {/* Column 1: Index / Play Icon */}
              <div className="flex items-center text-xs font-mono text-neutral-500">
                <span className={`group-hover:hidden ${isThisPlaying ? 'hidden' : 'block'}`}>
                  {idx + 1}
                </span>
                <span className={`group-hover:block ${isThisPlaying ? 'block' : 'hidden'}`}>
                  {isThisPlaying && isPlaying ? (
                    <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                  ) : (
                    <Play className="w-4 h-4 fill-white text-white" />
                  )}
                </span>
              </div>

              {/* Column 2: Title & Artist + Cover */}
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <div className="w-10 h-10 rounded bg-neutral-800 shrink-0 overflow-hidden border border-neutral-800/80">
                  <img
                    src={track.cover || 'https://via.placeholder.com/40'}
                    alt={track.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-sm truncate font-medium ${isThisPlaying ? 'text-emerald-400 font-semibold' : 'text-white'}`}>
                    {track.title}
                  </span>
                  <span className="text-xs text-neutral-400 truncate">
                    {track.artist}
                  </span>
                </div>
              </div>

              {/* Column 3: Album */}
              <div className="hidden md:block truncate text-xs text-neutral-400 pr-4">
                {track.album || 'Single'}
              </div>

              {/* Column 4: Year */}
              <div className="hidden sm:block text-right text-xs font-mono text-neutral-500 pr-2">
                {track.year || '----'}
              </div>

              {/* Column 5: Duration */}
              <div className="text-right text-xs font-mono text-neutral-400">
                {formatDuration(track.duration)}
              </div>

              {/* Column 6: More Actions Dropdown */}
              <div
                className="relative flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setActiveMenuId(activeMenuId === track.id ? null : track.id)}
                  className="p-1.5 text-neutral-500 hover:text-white rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  title="More Options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {/* Dropdown Menu */}
                {activeMenuId === track.id && (
                  <div
                    className="absolute right-0 top-8 w-48 bg-[#141414] border border-neutral-800 rounded-lg shadow-2xl py-1.5 z-50 text-xs"
                    onMouseLeave={() => setActiveMenuId(null)}
                  >
                    <button
                      onClick={() => {
                        toggleFavorite(track);
                        setActiveMenuId(null);
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-neutral-800 flex items-center gap-2 text-neutral-200"
                    >
                      <Heart className={`w-3.5 h-3.5 ${isThisFav ? 'fill-red-500 text-red-500' : ''}`} />
                      <span>{isThisFav ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                    </button>

                    {playlists.length > 0 && (
                      <div className="border-t border-neutral-800 mt-1 pt-1">
                        <div className="px-3.5 py-1 text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                          Add to Playlist
                        </div>
                        {playlists.map((pl) => (
                          <button
                            key={pl.id}
                            onClick={() => {
                              addToPlaylist(pl.id, track);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-3.5 py-1.5 text-left hover:bg-neutral-800 flex items-center gap-2 text-neutral-300 truncate"
                          >
                            <Plus className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="truncate">{pl.name}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {currentPlaylistId && (
                      <div className="border-t border-neutral-800 mt-1 pt-1">
                        <button
                          onClick={() => {
                            removeFromPlaylist(currentPlaylistId, track.id);
                            setActiveMenuId(null);
                          }}
                          className="w-full px-3.5 py-2 text-left hover:bg-red-950/40 text-red-400 flex items-center gap-2"
                        >
                          Remove from this playlist
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
