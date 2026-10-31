import React from 'react';
import { X, ListMusic, Trash2, Volume2, Play } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function QueueModal() {
  const {
    isQueueOpen,
    setIsQueueOpen,
    queue,
    queueIndex,
    currentTrack,
    isPlaying,
    playTrack,
    setQueue,
  } = usePlayer();

  if (!isQueueOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-22 w-80 md:w-96 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-neutral-900 z-30 flex flex-col select-none shadow-2xl animate-slideLeft">
      {/* Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-neutral-900/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <ListMusic className="w-4 h-4 text-white" />
          <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400 font-mono">
            Playback Queue ({queue.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <button
              onClick={() => setQueue([])}
              className="p-1.5 text-neutral-500 hover:text-red-400 rounded-md transition-colors"
              title="Clear Queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsQueueOpen(false)}
            className="p-1.5 text-neutral-500 hover:text-white rounded-md transition-colors"
            title="Close Queue (Q)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Currently Playing Section */}
        {currentTrack && (
          <div>
            <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase font-mono mb-2 block">
              Now Playing
            </span>
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800">
              <img
                src={currentTrack.cover || 'https://via.placeholder.com/40'}
                alt={currentTrack.title}
                className="w-10 h-10 rounded object-cover shrink-0"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-emerald-400 truncate flex items-center gap-1.5">
                  {currentTrack.title}
                  {isPlaying && <Volume2 className="w-3 h-3 shrink-0 animate-pulse" />}
                </span>
                <span className="text-[11px] text-neutral-400 truncate">{currentTrack.artist}</span>
              </div>
            </div>
          </div>
        )}

        {/* Next Up Section */}
        <div>
          <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase font-mono mb-2 block">
            Next Up
          </span>

          {queue.length <= 1 ? (
            <p className="text-xs text-neutral-600 text-center py-8">Your queue is empty</p>
          ) : (
            <div className="space-y-1">
              {queue.map((track, idx) => {
                if (idx <= queueIndex) return null; // already played or current
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    onClick={() => playTrack(track, queue)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-900/70 transition-colors cursor-pointer group"
                  >
                    <img
                      src={track.cover || 'https://via.placeholder.com/36'}
                      alt={track.title}
                      className="w-9 h-9 rounded object-cover shrink-0"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-white truncate group-hover:text-neutral-200">
                        {track.title}
                      </span>
                      <span className="text-[11px] text-neutral-400 truncate">{track.artist}</span>
                    </div>
                    <Play className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
