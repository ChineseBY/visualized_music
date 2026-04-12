import React, { useRef, useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { LiquidBackground } from "./components/LiquidBackground";
import { Upload, Play, Pause, SkipForward, SkipBack, Music, ListMusic, Volume2, VolumeX, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const NOTE_COLORS: Record<string, string> = {
  'C': '#FFB3BA', 'C#': '#FFC8BA', 'D': '#FFDFBA', 'D#': '#FFEABA',
  'E': '#FFFFBA', 'F': '#BAFFC9', 'F#': '#BAE1C9', 'G': '#BAE1FF',
  'G#': '#C9BAFF', 'A': '#E8BAFF', 'A#': '#F2BAFF', 'B': '#FFBAF2'
};

const NOTE_SYMBOLS = ['♪', '♫', '♩', '♬'];

interface Track {
  id: string | number;
  name: string;
  artist: string;
  publishTime: string;
  coverUrl: string;
}

interface LyricLine {
  time: number;
  text: string;
}

const getVisualLength = (str: string) => {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    len += str.charCodeAt(i) > 255 ? 1 : 0.55;
  }
  return Math.max(len, 1);
};

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentLyric, setCurrentLyric] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showError, setShowError] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const showNotesRef = useRef(true);
  
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Float32Array | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lastDropTimeRef = useRef<number>(0);
  const lastProcessTimeRef = useRef<number>(0);
  
  const notesContainerRef = useRef<HTMLDivElement>(null);

  const handleJsonUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        
        let items: any[] = [];
        if (Array.isArray(json)) {
          items = json;
        } else if (json.tracks && Array.isArray(json.tracks)) {
          items = json.tracks;
        } else if (json.songs && Array.isArray(json.songs)) {
          items = json.songs;
        } else if (json.data && Array.isArray(json.data)) {
          items = json.data;
        } else {
          items = [json];
        }
        
        const tracks: Track[] = [];
        items.forEach(item => {
          const ids = Array.isArray(item.track_ids) ? item.track_ids : (item.track_ids ? [item.track_ids] : (item.id ? [item.id] : []));
          ids.forEach((id: any, index: number) => {
            let coverUrl = "";
            const originalUrl = item.album?.cover_url || item.cover_url || "";
            if (originalUrl) {
              const match = originalUrl.match(/\/([^\/]+)\.\w+$/);
              if (match && match[1]) {
                coverUrl = `https://api.qijieya.cn/meting/?type=pic&id=${match[1]}`;
              } else {
                coverUrl = originalUrl;
              }
            }

            tracks.push({
              id,
              name: item.name || item.album?.name || `Track ${index + 1}`,
              artist: item.artists?.[0]?.name || item.artist || "Unknown Artist",
              publishTime: item.publish_time || "",
              coverUrl
            });
          });
        });
        
        if (tracks.length > 0) {
          setPlaylist(tracks);
          setCurrentIndex(0);
          setIsPlaying(false);
          setLyrics([]);
          setCurrentLyric("");
          setIsPlaylistOpen(true);
        } else {
          alert("No valid tracks found in JSON.");
        }
      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("Invalid JSON format");
      }
    };
    reader.readAsText(file);
  };

  // Fetch lyrics when track changes
  useEffect(() => {
    const track = playlist[currentIndex];
    if (!track) return;

    // Fetch lyrics
    fetch(`https://api.qijieya.cn/meting/?type=lrc&id=${track.id}`)
      .then(res => res.text())
      .then(text => {
        let lrcString = text;
        try {
          const json = JSON.parse(text);
          lrcString = json.lrc?.lyric || json.lyric || text;
        } catch(e) {
          // It's raw text, ignore
        }
        
        const lines = lrcString.split('\n');
        const parsed: LyricLine[] = [];
        for (const line of lines) {
          const match = line.match(/\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/);
          if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseFloat(match[2]);
            const txt = match[3].trim();
            if (txt) parsed.push({ time: min * 60 + sec, text: txt });
          }
        }
        setLyrics(parsed);
        setCurrentLyric("");
      })
      .catch(console.error);

    // Auto play if it was already playing
    if (audioRef.current) {
      audioRef.current.src = `https://api.qijieya.cn/meting/?type=url&id=${track.id}`;
      if (isPlaying) {
        audioRef.current.play().catch(() => {
          // Ignore play errors here, onError will handle the UI and skip
        });
      }
    }
  }, [currentIndex, playlist]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    setCurrentTime(time);
    setDuration(audioRef.current.duration || 0);
    
    let currentTxt = "";
    for (let i = 0; i < lyrics.length; i++) {
      if (time >= lyrics[i].time) {
        currentTxt = lyrics[i].text;
      } else {
        break;
      }
    }
    
    if (currentTxt !== currentLyric) {
      setCurrentLyric(currentTxt);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleNotes = () => {
    setShowNotes(!showNotes);
    showNotesRef.current = !showNotes;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!audioCtxRef.current) {
        initAudio();
      } else if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        if (!animationRef.current) {
          visualize(performance.now());
        }
      }).catch(() => {
        // Ignore play errors here, onError will handle the UI
      });
    }
  };

  const playNext = () => {
    if (playlist.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
      setIsPlaying(true);
    }
  };

  const handleAudioError = () => {
    if (!playlist[currentIndex]) return;
    setShowError(true);
    
    setTimeout(() => {
      playNext();
    }, 1000);

    setTimeout(() => {
      setShowError(false);
    }, 2000);
  };

  const playPrev = () => {
    if (playlist.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
      setIsPlaying(true);
    }
  };

  const playTrack = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  const initAudio = () => {
    if (!audioRef.current) return;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      
      if (!sourceNodeRef.current) {
        sourceNodeRef.current = audioCtx.createMediaElementSource(audioRef.current);
      }
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current.connect(analyser);
      analyser.connect(audioCtx.destination);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Float32Array(analyser.frequencyBinCount);
    } catch (error) {
      console.error("Error initializing audio context:", error);
    }
  };

  const visualize = (time: number) => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    
    if (audioRef.current && !audioRef.current.paused) {
      animationRef.current = requestAnimationFrame(visualize);
    } else {
      animationRef.current = null;
      return;
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    
    if (time - lastProcessTimeRef.current < 80) return;
    lastProcessTimeRef.current = time;
    
    analyserRef.current.getFloatFrequencyData(dataArrayRef.current);
    
    const sampleRate = audioCtxRef.current?.sampleRate || 44100;
    const binWidth = sampleRate / analyserRef.current.fftSize;
    
    const minBin = Math.floor(200 / binWidth);
    const maxBin = Math.floor(2000 / binWidth);

    let maxVal = -Infinity;
    let peakBin = -1;

    for (let i = minBin; i <= maxBin; i++) {
      if (dataArrayRef.current[i] > maxVal) {
        maxVal = dataArrayRef.current[i];
        peakBin = i;
      }
    }

    if (maxVal > -45 && time - lastDropTimeRef.current > 500) {
      const freq = peakBin * binWidth;
      const midiNote = Math.round(69 + 12 * Math.log2(freq / 440));
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const noteName = noteNames[midiNote % 12];

      if (showNotesRef.current) {
        triggerNoteDrop(noteName, time, midiNote);
      }
    }
  };

  const triggerNoteDrop = (noteName: string, time: number, midiNote: number) => {
    const app = (window as any).__refractionStageApp as any;
    if (!app || !app.liquidPlane) return;

    lastDropTimeRef.current = time;

    // 随机生成位置，但避开右下角的控制卡片
    // WebGL 坐标系: x [-1, 1], y [-1, 1]
    // 右下角大约是 x > 0.2 且 y < -0.2
    let nx = (Math.random() * 1.8) - 0.9;
    let ny = (Math.random() * 1.8) - 0.9;
    
    if (nx > 0.2 && ny < -0.2) {
      // 如果落在右下角，将其镜像翻转到左上角
      nx = -nx;
      ny = -ny;
    }

    app.liquidPlane.addDrop(nx, ny, 0.02, 0.015);

    const canvas = document.getElementById('refraction-canvas');
    if (canvas) {
      canvas.dispatchEvent(new PointerEvent('pointermove', { 
        clientX: window.innerWidth / 2, 
        clientY: window.innerHeight / 2 
      }));
    }

    if (notesContainerRef.current) {
      const noteEl = document.createElement('div');
      const symbol = NOTE_SYMBOLS[Math.floor(Math.random() * NOTE_SYMBOLS.length)];
      noteEl.textContent = `${symbol} ${noteName}`;
      
      // 根据音高 (midiNote) 动态计算音符大小
      // midiNote 通常在 40 (低音) 到 90 (高音) 之间
      const sizeRem = 1.5 + Math.max(0, Math.min(1, (midiNote - 40) / 50)) * 3; // 范围 1.5rem 到 4.5rem
      
      noteEl.className = 'absolute font-black pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] note-animation z-0';
      noteEl.style.fontSize = `${sizeRem}rem`;
      noteEl.style.color = NOTE_COLORS[noteName] || '#fff';
      noteEl.style.webkitTextStroke = '1px rgba(255,255,255,0.6)';

      const leftPct = (nx + 1) / 2 * 100;
      const topPct = (-ny + 1) / 2 * 100;

      noteEl.style.left = `${leftPct}%`;
      noteEl.style.top = `${topPct}%`;

      notesContainerRef.current.appendChild(noteEl);

      setTimeout(() => {
        if (notesContainerRef.current?.contains(noteEl)) {
          notesContainerRef.current.removeChild(noteEl);
        }
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, []);

  const renderLyric = (lyric: string) => {
    const match = lyric.match(/^(.*?)\s*[(（](.*?)[)）]$/);
    if (match) {
      const original = match[1].trim();
      const translation = match[2].trim();
      return (
        <div className="flex flex-col items-center justify-center gap-2 w-full px-4">
          <span 
            className="font-bold text-white/90 tracking-wider text-center whitespace-nowrap" 
            style={{ 
              fontSize: `min(clamp(1.5rem, 4vw, 3rem), 80vw / ${getVisualLength(original)})`,
              WebkitTextStroke: '1px rgba(255,255,255,0.4)',
              textShadow: '0 4px 16px rgba(0,0,0,0.3)'
            }}
          >
            {original}
          </span>
          <span 
            className="font-medium text-white/70 tracking-wide text-center whitespace-nowrap" 
            style={{ 
              fontFamily: 'GenshinFont, sans-serif',
              fontSize: `min(clamp(1rem, 2.5vw, 2rem), 80vw / ${getVisualLength(translation)})`,
              textShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {translation}
          </span>
        </div>
      );
    }
    
    return (
      <span 
        className="font-bold text-white/90 tracking-wider text-center whitespace-nowrap px-4" 
        style={{ 
          fontSize: `min(clamp(1.5rem, 4vw, 3rem), 80vw / ${getVisualLength(lyric)})`,
          WebkitTextStroke: '1px rgba(255,255,255,0.4)',
          textShadow: '0 4px 16px rgba(0,0,0,0.3)'
        }}
      >
        {lyric}
      </span>
    );
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden font-sans selection:bg-pink-300 selection:text-white">
      <LiquidBackground />

      {/* Top right controls */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-4">
        <button 
          onClick={toggleNotes}
          className={`p-3 rounded-full backdrop-blur-md transition-all shadow-lg border ${showNotes ? 'bg-white/20 border-white/30 text-white hover:bg-white/30' : 'bg-black/20 border-white/10 text-white/50 hover:bg-black/30'}`}
          title={showNotes ? "Hide Notes" : "Show Notes"}
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {showError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-3 rounded-full shadow-lg backdrop-blur-md font-medium"
          >
            歌曲获取失败
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={notesContainerRef} className={`absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden transition-opacity duration-500 ${showNotes ? 'opacity-100' : 'opacity-0'}`} />

      {/* 居中显示的单行歌词 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 px-8">
        <AnimatePresence mode="wait">
          {currentLyric && (
            <motion.div
              key={currentLyric}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="w-full flex flex-col items-center justify-center"
            >
              {renderLyric(currentLyric)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 右下角控制卡片 */}
      <motion.div 
        drag
        dragMomentum={false}
        className="absolute bottom-8 right-8 z-20 flex items-center cursor-grab active:cursor-grabbing"
      >
        {playlist.length === 0 ? (
          <div className="w-80 bg-white/90 backdrop-blur-xl border border-white/30 p-6 rounded-3xl shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 py-4">
              <Music className="w-12 h-12 text-gray-800/50" />
              <p className="text-sm text-gray-800 font-medium text-center">Import Playlist JSON</p>
              <label className="cursor-pointer bg-gray-900 hover:bg-gray-800 text-white py-3 px-6 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg w-full">
                <Upload className="w-5 h-5" />
                <span>Select JSON</span>
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleJsonUpload}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="relative flex items-center">
            {/* Album Art (Vinyl) */}
            <div 
              onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
              className={`absolute -left-16 w-32 h-32 rounded-full shadow-2xl border-4 border-white z-10 overflow-hidden flex items-center justify-center bg-gray-900 cursor-pointer ${isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}
            >
              {playlist[currentIndex].coverUrl ? (
                <img 
                  src={playlist[currentIndex].coverUrl} 
                  alt="cover" 
                  className="w-full h-full object-cover pointer-events-none" 
                />
              ) : (
                <Music className="w-12 h-12 text-white/50 pointer-events-none" />
              )}
              {/* Vinyl center hole */}
              <div className="absolute w-4 h-4 bg-white rounded-full shadow-inner pointer-events-none" />
            </div>

            {/* Main Card */}
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-6 pl-20 w-80 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{playlist[currentIndex].name}</h3>
                  <p className="text-sm text-gray-500 truncate">{playlist[currentIndex].artist}</p>
                </div>
                <button onClick={toggleMute} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>

              {/* Progress Bar */}
              <div className="flex items-center gap-2 mt-1">
                <input 
                  type="range" 
                  min={0} 
                  max={duration || 100} 
                  value={currentTime} 
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full"
                  style={{
                    background: `linear-gradient(to right, #2563eb ${(currentTime / (duration || 1)) * 100}%, #e5e7eb ${(currentTime / (duration || 1)) * 100}%)`
                  }}
                />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center mt-2">
                <div className="flex items-center gap-6">
                  <button onClick={playPrev} className="text-gray-900 hover:text-gray-600 transition-colors">
                    <SkipBack className="w-6 h-6" fill="currentColor" />
                  </button>
                  <button onClick={togglePlay} className="text-gray-900 hover:text-gray-600 transition-colors">
                    {isPlaying ? <Pause className="w-8 h-8" fill="currentColor" /> : <Play className="w-8 h-8 ml-1" fill="currentColor" />}
                  </button>
                  <button onClick={playNext} className="text-gray-900 hover:text-gray-600 transition-colors">
                    <SkipForward className="w-6 h-6" fill="currentColor" />
                  </button>
                </div>
              </div>

              {/* Expandable Playlist */}
              <AnimatePresence>
                {isPlaylistOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 max-h-60 overflow-y-auto flex flex-col gap-1 pr-1 custom-scrollbar">
                      {playlist.map((track, index) => (
                        <div 
                          key={`${track.id}-${index}`} 
                          onClick={() => playTrack(index)} 
                          className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${index === currentIndex ? 'bg-gray-100 shadow-sm' : 'hover:bg-gray-50'}`}
                        >
                          {track.coverUrl ? (
                            <img src={track.coverUrl} loading="lazy" className="w-10 h-10 rounded-lg object-cover shadow-sm" />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                              <Music className="w-5 h-5 text-gray-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${index === currentIndex ? 'text-blue-600' : 'text-gray-900'}`}>
                              {track.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                          </div>
                          {index === currentIndex && isPlaying && (
                            <div className="w-4 h-4 flex items-end justify-between gap-0.5">
                              <motion.div animate={{ height: ["20%", "100%", "20%"] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1 bg-blue-600 rounded-t-sm" />
                              <motion.div animate={{ height: ["60%", "30%", "100%", "60%"] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1 bg-blue-600 rounded-t-sm" />
                              <motion.div animate={{ height: ["100%", "40%", "80%", "100%"] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1 bg-blue-600 rounded-t-sm" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>

      <audio 
        ref={audioRef} 
        crossOrigin="anonymous"
        onEnded={playNext}
        onError={handleAudioError}
        onPause={() => setIsPlaying(false)}
        onPlay={() => {
          setIsPlaying(true);
          if (!animationRef.current) {
            visualize(performance.now());
          }
        }}
        onTimeUpdate={handleTimeUpdate}
        className="hidden"
      />
    </main>
  );
}
