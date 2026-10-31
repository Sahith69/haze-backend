import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import NowPlayingBar from './components/NowPlayingBar';
import TrackList from './components/TrackList';
import LyricsModal from './components/LyricsModal';
import Visualizer from './components/Visualizer';
import QueueModal from './components/QueueModal';
import SpotifyImportModal from './components/SpotifyImportModal';
import { usePlayer } from './context/PlayerContext';
import { Play, Sparkles, Heart, ListMusic, Trash2, Music2, Disc3 } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState('home'); // 'home' | 'search' | 'favorites' | 'playlist'
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [trendingTracks, setTrendingTracks] = useState([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);

  const {
    favorites,
    playTrack,
    deletePlaylist,
    history,
  } = usePlayer();

  // Load trending tracks on mount
  useEffect(() => {
    async function loadTrending() {
      try {
        const res = await fetch('/api/trending');
        if (res.ok) {
          const data = await res.json();
          setTrendingTracks(data.tracks || []);
        }
      } catch (err) {
        console.error('Failed to load trending:', err);
      } finally {
        setIsLoadingTrending(false);
      }
    }
    loadTrending();
  }, []);

  // Perform search
  const handleSearch = async (query) => {
    if (!query) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.tracks || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden select-none font-sans">
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        selectedPlaylist={selectedPlaylist}
        setSelectedPlaylist={setSelectedPlaylist}
      />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#080808] relative">
        {/* Top Header */}
        <Header
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearch={handleSearch}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
        />

        {/* Scrollable Main Views */}
        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-10 pb-28">
          {/* TAB 1: HOME */}
          {currentTab === 'home' && !selectedPlaylist && (
            <div className="space-y-10 max-w-7xl mx-auto animate-fadeIn">
              {/* Featured Banner */}
              <div className="relative rounded-2xl p-8 bg-gradient-to-r from-neutral-900 to-neutral-950 border border-neutral-800/80 overflow-hidden shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="relative z-10 space-y-3 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-mono tracking-wider">
                    <Sparkles className="w-3 h-3" />
                    <span>Pure FLAC & 256kbps Lossless Audio</span>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                    Welcome to Monochrome.
                  </h1>
                  <p className="text-sm text-neutral-400 max-w-lg">
                    Stream millions of songs with bit-perfect lossless quality, synchronized lyrics, audio visualizers, and Spotify imports.
                  </p>
                  {trendingTracks.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={() => playTrack(trendingTracks[0], trendingTracks)}
                        className="px-6 py-2.5 rounded-full bg-white text-black text-xs font-bold hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 shadow-lg"
                      >
                        <Play className="w-4 h-4 fill-black text-black" />
                        <span>Play Top Songs</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative w-48 h-48 md:w-56 md:h-56 shrink-0 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-white/5 animate-pulse" />
                  <Disc3 className="w-40 h-40 md:w-48 md:h-48 text-neutral-800 animate-spin-slow opacity-80" />
                </div>
              </div>

              {/* Trending Top Songs Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-neutral-400" />
                    <span>Trending Now</span>
                  </h2>
                  <span className="text-xs text-neutral-500 font-mono">Top Charts</span>
                </div>

                {isLoadingTrending ? (
                  <div className="py-12 text-center text-xs text-neutral-500">Loading top songs...</div>
                ) : (
                  <TrackList tracks={trendingTracks} />
                )}
              </div>

              {/* Recently Played Section */}
              {history.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-neutral-900">
                  <h2 className="text-lg font-bold text-white tracking-tight">Recently Played</h2>
                  <TrackList tracks={history.slice(0, 10)} />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SEARCH */}
          {currentTab === 'search' && !selectedPlaylist && (
            <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {searchQuery ? `Search Results for "${searchQuery}"` : 'Browse Catalog'}
                </h1>
                <p className="text-xs text-neutral-500 mt-1">
                  {isSearching
                    ? 'Searching catalog...'
                    : searchResults.length > 0
                    ? `Found ${searchResults.length} songs`
                    : 'Search any track, artist, album, or unreleased music'}
                </p>
              </div>

              {searchResults.length > 0 ? (
                <TrackList tracks={searchResults} />
              ) : !searchQuery ? (
                <div className="space-y-6 pt-4">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider font-mono">
                    Popular Artists
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {['Coldplay', 'The Weeknd', 'Daft Punk', 'Adele', 'Kendrick Lamar', 'Radiohead'].map((artist) => (
                      <button
                        key={artist}
                        onClick={() => {
                          setSearchQuery(artist);
                          handleSearch(artist);
                        }}
                        className="p-4 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 border border-neutral-800/80 text-left transition-all group"
                      >
                        <span className="text-xs font-bold text-white group-hover:underline block">{artist}</span>
                        <span className="text-[10px] text-neutral-500">Search catalog</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-sm text-neutral-500">
                  No matching tracks found. Try a different search term.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FAVORITES */}
          {currentTab === 'favorites' && !selectedPlaylist && (
            <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-900">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-950 flex items-center justify-center text-white shadow-xl">
                    <Heart className="w-8 h-8 fill-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Liked Songs</h1>
                    <p className="text-xs text-neutral-400 mt-0.5">{favorites.length} favorite songs</p>
                  </div>
                </div>
                {favorites.length > 0 && (
                  <button
                    onClick={() => playTrack(favorites[0], favorites)}
                    className="px-5 py-2.5 rounded-full bg-white text-black font-semibold text-xs hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-black text-black" />
                    <span>Play All</span>
                  </button>
                )}
              </div>

              {favorites.length === 0 ? (
                <div className="py-24 text-center text-xs text-neutral-500 space-y-2">
                  <p>You haven't added any favorite songs yet.</p>
                  <p className="text-neutral-600">Click the heart icon on any song to save it here!</p>
                </div>
              ) : (
                <TrackList tracks={favorites} />
              )}
            </div>
          )}

          {/* TAB 4: PLAYLIST VIEW */}
          {selectedPlaylist && (
            <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn">
              <div className="flex items-center justify-between pb-6 border-b border-neutral-900">
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 shadow-xl overflow-hidden">
                    {selectedPlaylist.tracks?.[0]?.cover ? (
                      <img
                        src={selectedPlaylist.tracks[0].cover}
                        alt="Playlist Cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ListMusic className="w-8 h-8" />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500 font-mono">
                      Playlist
                    </span>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{selectedPlaylist.name}</h1>
                    <p className="text-xs text-neutral-400 mt-1">
                      {selectedPlaylist.tracks?.length || 0} tracks
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {selectedPlaylist.tracks?.length > 0 && (
                    <button
                      onClick={() => playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)}
                      className="px-5 py-2.5 rounded-full bg-white text-black font-semibold text-xs hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-black text-black" />
                      <span>Play</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete playlist "${selectedPlaylist.name}"?`)) {
                        deletePlaylist(selectedPlaylist.id);
                        setSelectedPlaylist(null);
                        setCurrentTab('home');
                      }
                    }}
                    className="p-2.5 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-900 transition-colors"
                    title="Delete Playlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selectedPlaylist.tracks?.length === 0 ? (
                <div className="py-20 text-center text-xs text-neutral-500">
                  This playlist is empty. Add songs from Search or Home!
                </div>
              ) : (
                <TrackList tracks={selectedPlaylist.tracks} currentPlaylistId={selectedPlaylist.id} />
              )}
            </div>
          )}
        </main>

        {/* Synced Lyrics Overlay Modal */}
        <LyricsModal />

        {/* Real-time Spectrum Visualizer Overlay Modal */}
        <Visualizer />

        {/* Playback Queue Drawer */}
        <QueueModal />

        {/* Spotify Importer Modal */}
        <SpotifyImportModal />

        {/* Fixed Now Playing Bottom Bar */}
        <NowPlayingBar />
      </div>
    </div>
  );
}
