import React from 'react';
import { Home, Search, Library, Heart, Plus, Music, Upload, ListMusic } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function Sidebar({ currentTab, setCurrentTab, selectedPlaylist, setSelectedPlaylist }) {
  const { playlists, setIsSpotifyModalOpen, createPlaylist } = usePlayer();

  const handleCreateNew = () => {
    const name = prompt('Enter playlist name:');
    if (name) {
      const pl = createPlaylist(name);
      setSelectedPlaylist(pl);
      setCurrentTab('playlist');
    }
  };

  return (
    <aside className="w-64 bg-[#0a0a0a] border-r border-neutral-900 flex flex-col h-full select-none shrink-0">
      {/* Brand Header */}
      <div className="p-6 flex items-center gap-3 border-b border-neutral-900/60">
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          <div className="w-2.5 h-2.5 rounded-full bg-black" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-widest text-white uppercase font-mono">Monochrome</span>
          <span className="text-[10px] text-neutral-500 font-medium tracking-wider">HI-RES AUDIO</span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="px-3 py-4 space-y-1">
        <button
          onClick={() => {
            setCurrentTab('home');
            setSelectedPlaylist(null);
          }}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            currentTab === 'home' && !selectedPlaylist
              ? 'bg-neutral-800 text-white font-semibold'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </button>

        <button
          onClick={() => {
            setCurrentTab('search');
            setSelectedPlaylist(null);
          }}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            currentTab === 'search' && !selectedPlaylist
              ? 'bg-neutral-800 text-white font-semibold'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Search</span>
        </button>

        <button
          onClick={() => {
            setCurrentTab('favorites');
            setSelectedPlaylist(null);
          }}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            currentTab === 'favorites' && !selectedPlaylist
              ? 'bg-neutral-800 text-white font-semibold'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Heart className="w-4 h-4" />
          <span>Favorites</span>
        </button>
      </div>

      {/* Spotify & Quick Actions */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setIsSpotifyModalOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold bg-neutral-900/90 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-neutral-800 transition-all shadow-sm"
        >
          <Upload className="w-3.5 h-3.5 text-green-400" />
          <span>Import Spotify Playlist</span>
        </button>
      </div>

      {/* Playlists Header */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between border-t border-neutral-900/60">
        <span className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Your Playlists</span>
        <button
          onClick={handleCreateNew}
          title="Create Playlist"
          className="text-neutral-500 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Playlists List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {playlists.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-600">
            No playlists yet. Create one or import from Spotify!
          </div>
        ) : (
          playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => {
                setSelectedPlaylist(pl);
                setCurrentTab('playlist');
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left truncate transition-colors ${
                selectedPlaylist?.id === pl.id
                  ? 'bg-neutral-800/80 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900/70'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate">{pl.name}</span>
              <span className="ml-auto text-[10px] text-neutral-600 shrink-0">{pl.tracks?.length || 0}</span>
            </button>
          ))
        )}
      </div>

      {/* Bottom Info / Status */}
      <div className="p-4 border-t border-neutral-900 text-[11px] text-neutral-500 flex items-center justify-between font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Local Engine
        </span>
        <span className="text-neutral-600">v2.5</span>
      </div>
    </aside>
  );
}
