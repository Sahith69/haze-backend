import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('mono_volume');
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'all' | 'one'
  const [audioQuality, setAudioQuality] = useState('HI-RES FLAC');
  const [isFlac, setIsFlac] = useState(false);
  
  // Modals & Panels
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  
  // Lyrics state
  const [lyricsData, setLyricsData] = useState({ synced: [], plain: '', hasSync: false });
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);

  // Playlists & Favorites (persisted)
  const [playlists, setPlaylists] = useState(() => {
    try {
      const saved = localStorage.getItem('mono_playlists');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('mono_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('mono_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Audio & Web Audio API references
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);

  // Initialize Audio element
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Update synced lyrics active index
      if (lyricsData?.synced?.length > 0) {
        const cur = audio.currentTime;
        let index = -1;
        for (let i = 0; i < lyricsData.synced.length; i++) {
          if (cur >= lyricsData.synced[i].time - 0.25) {
            index = i;
          } else {
            break;
          }
        }
        setActiveLyricIndex(index);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsLoading(false);
    };

    const handleEnded = () => {
      handleNextTrack();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.pause();
    };
  }, [lyricsData]);

  // Connect Web Audio API Analyser on first interaction (48kHz sample-rate matched)
  const initWebAudio = () => {
    if (!audioContextRef.current && audioRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx({ sampleRate: 48000 });
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        source.connect(ctx.destination);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceNodeRef.current = source;
      } catch (e) {
        console.warn('Web Audio initialization error (CORS or permissions):', e);
      }
    } else if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('mono_volume', volume.toString());
  }, [volume, isMuted]);

  // Save playlists & favorites
  useEffect(() => {
    localStorage.setItem('mono_playlists', JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    localStorage.setItem('mono_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('mono_history', JSON.stringify(history.slice(0, 50)));
  }, [history]);

  // Fetch lyrics for current track
  const fetchLyrics = async (track) => {
    if (!track) return;
    setIsLoadingLyrics(true);
    setLyricsData({ synced: [], plain: '', hasSync: false });
    setActiveLyricIndex(-1);

    try {
      const res = await fetch(`/api/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}&duration=${track.duration || ''}`);
      if (res.ok) {
        const data = await res.json();
        setLyricsData(data);
      }
    } catch (e) {
      console.warn('Failed to fetch lyrics:', e);
    } finally {
      setIsLoadingLyrics(false);
    }
  };

  // Play a track
  const playTrack = async (track, newQueue = null) => {
    if (!track) return;
    initWebAudio();

    if (newQueue) {
      setQueue(newQueue);
      const idx = newQueue.findIndex((t) => t.id === track.id);
      setQueueIndex(idx !== -1 ? idx : 0);
    }

    setCurrentTrack(track);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(track.duration || 0);

    // Add to history
    setHistory((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 50));

    // Fetch lyrics concurrently
    fetchLyrics(track);

    try {
      const res = await fetch(`/api/stream?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}&quality=flac`);
      if (!res.ok) throw new Error('Stream resolution failed');
      const data = await res.json();

      setIsFlac(!!data.isFlac);
      setAudioQuality(data.quality || (data.isFlac ? '1,411 kbps · Pure Lossless FLAC Master' : '320 kbps · Studio Master'));

      if (audioRef.current) {
        // Use proxyUrl to prevent CORS issues with Web Audio API
        audioRef.current.src = data.proxyUrl || data.streamUrl;
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Error playing track:', err);
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    initWebAudio();
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const seek = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (val) => {
    setVolumeState(Math.max(0, Math.min(1, val)));
    if (isMuted) setIsMuted(false);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleNextTrack = () => {
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      return;
    }

    if (queue.length === 0) return;

    let nextIdx;
    if (isShuffle) {
      if (queue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === queueIndex);
      } else {
        nextIdx = 0;
      }
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeatMode === 'all') {
          nextIdx = 0;
        } else {
          return; // Ended
        }
      }
    }

    setQueueIndex(nextIdx);
    playTrack(queue[nextIdx]);
  };

  const handlePrevTrack = () => {
    if (currentTime > 3 && audioRef.current) {
      audioRef.current.currentTime = 0;
      return;
    }
    if (queue.length === 0) return;

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = queue.length - 1;
    }
    setQueueIndex(prevIdx);
    playTrack(queue[prevIdx]);
  };

  const toggleFavorite = (track) => {
    setFavorites((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      if (exists) {
        return prev.filter((t) => t.id !== track.id);
      } else {
        return [track, ...prev];
      }
    });
  };

  const isFavorite = (trackId) => {
    return favorites.some((t) => t.id === trackId);
  };

  const createPlaylist = (name, tracks = []) => {
    const newPlaylist = {
      id: `pl-${Date.now()}`,
      name: name.trim() || 'Untitled Playlist',
      createdAt: new Date().toISOString(),
      tracks,
    };
    setPlaylists((prev) => [newPlaylist, ...prev]);
    return newPlaylist;
  };

  const addToPlaylist = (playlistId, track) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          const exists = pl.tracks.some((t) => t.id === track.id);
          if (exists) return pl;
          return { ...pl, tracks: [...pl.tracks, track] };
        }
        return pl;
      })
    );
  };

  const removeFromPlaylist = (playlistId, trackId) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          return { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) };
        }
        return pl;
      })
    );
  };

  const deletePlaylist = (playlistId) => {
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        handleNextTrack();
      } else if (e.code === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        handlePrevTrack();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(Math.min(duration, currentTime + 5));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(Math.max(0, currentTime - 5));
      } else if (e.code === 'KeyL') {
        setIsLyricsOpen((prev) => !prev);
      } else if (e.code === 'KeyV') {
        setIsVisualizerOpen((prev) => !prev);
      } else if (e.code === 'KeyQ') {
        setIsQueueOpen((prev) => !prev);
      } else if (e.code === 'KeyM') {
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTrack, currentTime, duration, queue, queueIndex]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isLoading,
        currentTime,
        duration,
        volume,
        isMuted,
        queue,
        queueIndex,
        isShuffle,
        repeatMode,
        audioQuality,
        isFlac,
        isLyricsOpen,
        isVisualizerOpen,
        isQueueOpen,
        isSpotifyModalOpen,
        lyricsData,
        isLoadingLyrics,
        activeLyricIndex,
        playlists,
        favorites,
        history,
        analyserRef,
        playTrack,
        togglePlay,
        seek,
        setVolume,
        toggleMute,
        nextTrack: handleNextTrack,
        prevTrack: handlePrevTrack,
        setIsShuffle,
        setRepeatMode,
        setIsLyricsOpen,
        setIsVisualizerOpen,
        setIsQueueOpen,
        setIsSpotifyModalOpen,
        toggleFavorite,
        isFavorite,
        createPlaylist,
        addToPlaylist,
        removeFromPlaylist,
        deletePlaylist,
        setQueue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
}
