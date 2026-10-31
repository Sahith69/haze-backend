import React, { useRef, useEffect } from 'react';
import { Search, X, Sparkles } from 'lucide-react';

export default function Header({ searchQuery, setSearchQuery, onSearch, currentTab, setCurrentTab }) {
  const searchInputRef = useRef(null);

  // Focus search input when pressing '/'
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        setCurrentTab('search');
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentTab]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setCurrentTab('search');
      onSearch(searchQuery.trim());
    }
  };

  return (
    <header className="h-16 px-6 bg-[#080808]/80 backdrop-blur-md border-b border-neutral-900/60 flex items-center justify-between shrink-0 select-none z-20">
      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="relative w-full max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search songs, artists, albums... (Press '/' to focus)"
          className="w-full bg-[#121212] text-sm text-white placeholder-neutral-500 pl-10 pr-10 py-2 rounded-full border border-neutral-800 focus:border-neutral-500 focus:outline-none transition-colors shadow-inner"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </form>

      {/* Right Quick Nav info */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/80 border border-neutral-800 text-[11px] text-neutral-400 font-mono">
          <Sparkles className="w-3 h-3 text-neutral-300" />
          <span>True FLAC & Hi-Res Audio</span>
        </div>
      </div>
    </header>
  );
}
