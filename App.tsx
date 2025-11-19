
import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import { generateLevel } from './services/geminiService';
import { GameStatus, LevelConfig, LeaderboardEntry } from './types';
import { CircleNotch, Trophy, Skull, Play, Pause, Star, Timer, Coin, House, ArrowCounterClockwise, FloppyDisk, Clock } from 'phosphor-react';
import { initAudio } from './services/audioService';
import { MAX_LEADERBOARD_ENTRIES } from './constants';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.MENU);
  const [level, setLevel] = useState<LevelConfig | null>(null);
  const [seedsCollected, setSeedsCollected] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [loadingMessage, setLoadingMessage] = useState("Asking Gemini to build the plains...");
  
  // Stats State
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameTime, setGameTime] = useState(0); // Elapsed time in seconds
  
  const [lastRunStats, setLastRunStats] = useState({
    time: 0,
    seeds: 0,
    levelBonus: 0,
    timeBonus: 0,
    totalRunScore: 0
  });

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardQualifying, setIsLeaderboardQualifying] = useState(false);
  const [playerName, setPlayerName] = useState('');

  const startTimeRef = useRef<number>(0);
  const totalPausedTimeRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);

  // Load High Score & Leaderboard
  useEffect(() => {
    const savedScore = localStorage.getItem('prairie_highscore');
    if (savedScore) setHighScore(parseInt(savedScore, 10));

    try {
        const savedBoard = localStorage.getItem('prairie_leaderboard');
        if (savedBoard) {
            const parsed = JSON.parse(savedBoard) as LeaderboardEntry[];
            setLeaderboard(parsed);
            // Sync high score just in case
            if (parsed.length > 0 && parsed[0].score > (parseInt(savedScore || '0', 10))) {
                setHighScore(parsed[0].score);
            }
        }
    } catch (e) {
        console.error("Failed to load leaderboard", e);
    }
  }, []);

  // Save High Score (Legacy simple persistence, plus Leaderboard sync)
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('prairie_highscore', score.toString());
    }
  }, [score, highScore]);

  // Prevent spacebar scrolling
  useEffect(() => {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
      }
    });
  }, []);

  // Game Timer
  useEffect(() => {
    if (status === GameStatus.PLAYING) {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current - totalPausedTimeRef.current) / 1000);
        setGameTime(elapsed);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startGame = async (isNextLevel: boolean = false) => {
    initAudio(); // Initialize Audio Context on user interaction

    // If starting new run, reset total score
    if (!isNextLevel) {
      setScore(0);
      setIsLeaderboardQualifying(false);
    }
    
    setStatus(GameStatus.LOADING_LEVEL);
    setSeedsCollected(0);
    setGameTime(0);
    setLoadingMessage(isNextLevel ? "Scouting deeper territory..." : "Asking Gemini to build the plains...");
    
    // Slight delay for feel or API call
    const newLevel = await generateLevel(difficulty);
    setLevel(newLevel);
    
    startTimeRef.current = Date.now();
    totalPausedTimeRef.current = 0;
    pauseStartRef.current = 0;
    
    setStatus(GameStatus.PLAYING);
  };

  const togglePause = useCallback(() => {
    if (status === GameStatus.PLAYING) {
      pauseStartRef.current = Date.now();
      setStatus(GameStatus.PAUSED);
    } else if (status === GameStatus.PAUSED) {
      // Calculate how long we were paused and add to total
      const pausedDuration = Date.now() - pauseStartRef.current;
      totalPausedTimeRef.current += pausedDuration;
      setStatus(GameStatus.PLAYING);
    }
  }, [status]);

  // Keyboard listener for Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (status === GameStatus.PLAYING || status === GameStatus.PAUSED) {
          togglePause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, togglePause]);

  const checkLeaderboardQualification = useCallback((finalScore: number) => {
     // Check if this score qualifies for top 5
     if (finalScore <= 0) return false;
     
     // If board is not full, it qualifies
     if (leaderboard.length < MAX_LEADERBOARD_ENTRIES) return true;

     // If score is higher than the lowest score
     const lowestScore = leaderboard[leaderboard.length - 1].score;
     return finalScore > lowestScore;
  }, [leaderboard]);

  const handleGameOver = useCallback((win: boolean) => {
    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTimeRef.current - totalPausedTimeRef.current) / 1000);
    
    let finalScore = score;
    let runStats = {
        time: durationSeconds,
        seeds: seedsCollected,
        levelBonus: 0,
        timeBonus: 0,
        totalRunScore: score
    };

    if (win) {
      const levelBonus = 1000 * difficulty;
      const timeBonus = Math.max(0, (90 - durationSeconds) * 10);
      finalScore = score + levelBonus + timeBonus;
      
      setScore(finalScore);
      
      runStats = {
        time: durationSeconds,
        seeds: seedsCollected,
        levelBonus,
        timeBonus,
        totalRunScore: finalScore
      };
      
      setLastRunStats(runStats);
      setStatus(GameStatus.VICTORY);
    } else {
      setLastRunStats(runStats);
      setStatus(GameStatus.GAME_OVER);
      
      // Only check leaderboard on death (Game Over), because Victory leads to next level
      if (checkLeaderboardQualification(finalScore)) {
          setIsLeaderboardQualifying(true);
          setPlayerName('');
      }
    }
  }, [difficulty, seedsCollected, score, checkLeaderboardQualification]);

  const handleCollect = useCallback(() => {
    setSeedsCollected(prev => prev + 1);
    setScore(prev => prev + 100);
  }, []);

  const saveLeaderboardScore = () => {
      const name = playerName.trim() || `Prairie Dog ${Math.floor(Math.random() * 1000)}`;
      const newEntry: LeaderboardEntry = {
          name,
          score: lastRunStats.totalRunScore,
          date: new Date().toISOString()
      };

      const newBoard = [...leaderboard, newEntry]
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_LEADERBOARD_ENTRIES);
      
      setLeaderboard(newBoard);
      localStorage.setItem('prairie_leaderboard', JSON.stringify(newBoard));
      
      // Update high score display if needed
      if (newBoard.length > 0) setHighScore(newBoard[0].score);

      setIsLeaderboardQualifying(false);
      setStatus(GameStatus.MENU);
  };

  const quitFromVictory = () => {
      // If user quits after winning a level, submit score if qualified
      const finalScore = lastRunStats.totalRunScore;
      if (checkLeaderboardQualification(finalScore)) {
           setStatus(GameStatus.GAME_OVER); // Switch to Game Over view to show input
           setIsLeaderboardQualifying(true);
           setPlayerName('');
      } else {
           setStatus(GameStatus.MENU);
      }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-sans text-white">
      
      {/* Header / HUD */}
      <div className="w-full max-w-5xl flex justify-between items-center p-4 absolute top-0 left-0 z-10 pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg backdrop-blur-md border border-white/10">
            <span className="text-2xl">🐿️</span>
            <h1 className="font-bold text-lg hidden sm:block">Prairie Dog Run</h1>
          </div>
          {/* High Score Display */}
          <div className="hidden md:flex items-center gap-2 bg-amber-900/40 p-2 rounded-lg backdrop-blur-md border border-amber-500/20">
             <Trophy className="text-amber-400" weight="fill" />
             <div className="flex flex-col leading-none">
                <span className="text-[10px] text-amber-200/70 uppercase tracking-wider">Best</span>
                <span className="font-mono font-bold text-amber-400">{highScore.toLocaleString()}</span>
             </div>
          </div>
        </div>

        {/* Right Side HUD - Player Stats */}
        <div className="flex items-center gap-4 pointer-events-auto">
            {(status === GameStatus.PLAYING || status === GameStatus.PAUSED) && (
               <>
                  {/* Stats Panel */}
                  <div className="flex items-center gap-4 bg-black/60 p-2 rounded-xl backdrop-blur-md border border-white/10 shadow-lg">
                      
                      {/* Time */}
                      <div className="flex items-center gap-2 px-2">
                          <Clock className="text-blue-400" size={20} weight="fill" />
                          <div className="flex flex-col leading-none">
                            <span className="text-[9px] text-gray-400 uppercase font-bold">Time</span>
                            <span className="font-mono font-bold">{formatTime(gameTime)}</span>
                          </div>
                      </div>

                      <div className="w-px h-8 bg-white/10"></div>

                      {/* Seeds */}
                      <div className="flex items-center gap-2 px-2">
                          <Coin className="text-amber-400" size={20} weight="fill" />
                          <div className="flex flex-col leading-none">
                            <span className="text-[9px] text-gray-400 uppercase font-bold">Seeds</span>
                            <span className="font-mono font-bold">{seedsCollected}</span>
                          </div>
                      </div>

                      <div className="w-px h-8 bg-white/10"></div>

                      {/* Score */}
                      <div className="flex items-center gap-2 px-2">
                          <div className="flex flex-col items-end leading-none">
                             <span className="text-[9px] text-gray-400 uppercase font-bold">Score</span>
                             <span className="font-mono font-bold text-lg text-emerald-400">{score.toLocaleString()}</span>
                          </div>
                      </div>
                  </div>

                  {/* Pause Button */}
                  <button 
                    onClick={togglePause}
                    className="bg-white/10 hover:bg-white/20 p-3 rounded-xl backdrop-blur-md border border-white/10 transition-colors"
                    title={status === GameStatus.PAUSED ? "Resume" : "Pause"}
                  >
                    {status === GameStatus.PAUSED ? <Play weight="fill" size={20} /> : <Pause weight="fill" size={20} />}
                  </button>
               </>
            )}
        </div>
      </div>

      {/* Main Game Container */}
      <div className="relative w-full h-screen flex items-center justify-center">
        
        {level && (
          <GameCanvas 
            level={level} 
            status={status} 
            onGameOver={handleGameOver}
            onCollect={handleCollect}
          />
        )}

        {/* MENUS */}
        
        {/* PAUSE MENU */}
        {status === GameStatus.PAUSED && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
             <div className="bg-gray-800 p-8 rounded-2xl border border-gray-600 shadow-2xl text-center min-w-[300px]">
                <h2 className="text-4xl font-extrabold text-white mb-8 tracking-tight">PAUSED</h2>
                <div className="flex flex-col gap-3">
                   <button 
                      onClick={togglePause}
                      className="bg-amber-500 text-black font-bold py-3 rounded-lg hover:bg-amber-400 transition flex items-center justify-center gap-2"
                   >
                      <Play weight="fill" /> Resume
                   </button>
                   <button 
                      onClick={() => startGame(false)}
                      className="bg-gray-700 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition flex items-center justify-center gap-2"
                   >
                      <ArrowCounterClockwise weight="bold" /> Restart Level
                   </button>
                   <button 
                      onClick={() => setStatus(GameStatus.MENU)}
                      className="bg-transparent border border-white/20 text-white font-bold py-3 rounded-lg hover:bg-white/10 transition flex items-center justify-center gap-2"
                   >
                      <House weight="fill" /> Quit to Menu
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* MAIN MENU */}
        {status === GameStatus.MENU && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
                {/* Left Col: Game Start */}
                <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 shadow-2xl text-center flex flex-col justify-center">
                    <h1 className="text-4xl font-extrabold text-amber-400 mb-2">Prairie Dog <br/> Run</h1>
                    <p className="text-gray-400 mb-6">Use Arrow Keys or WASD to move. Space to Jump.</p>
                    
                    <div className="mb-6 space-y-2">
                        <p className="text-sm font-semibold text-gray-300">Select Difficulty:</p>
                        <div className="flex justify-center gap-2">
                        {[1, 2, 3].map((d) => (
                            <button
                            key={d}
                            onClick={() => setDifficulty(d)}
                            className={`px-4 py-2 rounded-lg font-bold transition-all ${
                                difficulty === d 
                                ? 'bg-amber-500 text-black scale-105 ring-2 ring-amber-300' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                            >
                            {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
                            </button>
                        ))}
                        </div>
                    </div>

                    <button
                        onClick={() => startGame(false)}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white text-xl font-bold py-4 rounded-xl shadow-lg transform transition hover:scale-105 flex items-center justify-center gap-2"
                    >
                        <Play weight="fill" /> Start Adventure
                    </button>
                    
                    <div className="mt-4 text-xs text-gray-500">
                        Levels generated by Gemini 2.5 Flash
                    </div>
                </div>

                {/* Right Col: Leaderboard */}
                <div className="bg-gray-800/90 p-6 rounded-2xl border border-gray-700 shadow-2xl flex flex-col">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <Trophy className="text-yellow-400" size={24} weight="fill" />
                        <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-black/20 rounded-xl p-2">
                        {leaderboard.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm italic">
                                <p>No champions yet.</p>
                                <p>Be the first!</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="text-xs text-gray-400 border-b border-white/10">
                                    <tr>
                                        <th className="pb-2 pl-2">Rank</th>
                                        <th className="pb-2">Name</th>
                                        <th className="pb-2 text-right pr-2">Score</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {leaderboard.map((entry, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="py-3 pl-2 font-mono text-gray-400">#{idx + 1}</td>
                                            <td className="py-3 font-bold text-amber-200">{entry.name}</td>
                                            <td className="py-3 pr-2 text-right font-mono">{entry.score.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* LOADING */}
        {status === GameStatus.LOADING_LEVEL && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 text-white">
             <CircleNotch size={64} className="animate-spin text-amber-500 mb-4" />
             <h2 className="text-2xl font-bold">{loadingMessage}</h2>
             <p className="text-gray-400 mt-2">Consulting the AI landscape architect...</p>
          </div>
        )}

        {/* GAME OVER */}
        {status === GameStatus.GAME_OVER && (
          <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
             <div className="bg-gray-900 p-8 rounded-2xl border border-red-500/50 text-center max-w-sm w-full shadow-2xl">
                <Skull size={64} className="mx-auto text-red-500 mb-4" />
                <h2 className="text-3xl font-bold text-white mb-2">Ouch!</h2>
                <p className="text-gray-400 mb-6">The prairie is a dangerous place.</p>
                
                <div className="bg-black/30 rounded-lg p-4 mb-6">
                   <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
                      <span className="text-gray-400">Run Score</span>
                      <span className="font-mono font-bold text-xl">{lastRunStats.totalRunScore.toLocaleString()}</span>
                   </div>
                   {isLeaderboardQualifying && (
                     <div className="text-amber-400 font-bold text-sm animate-pulse mt-2">
                        🏆 NEW HIGH SCORE!
                     </div>
                   )}
                </div>

                {isLeaderboardQualifying ? (
                    <div className="mb-6 animate-fade-in">
                        <label className="block text-left text-xs text-gray-400 mb-1 ml-1">Enter Your Name:</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                maxLength={12}
                                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 flex-1 text-white focus:border-amber-500 outline-none"
                                placeholder="Prairie Dog"
                                autoFocus
                            />
                            <button 
                                onClick={saveLeaderboardScore}
                                className="bg-amber-500 text-black p-2 rounded-lg hover:bg-amber-400 transition"
                                title="Save Score"
                            >
                                <FloppyDisk size={24} weight="fill" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <button onClick={() => startGame(false)} className="bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200 transition">Try Again (New Run)</button>
                        <button onClick={() => setStatus(GameStatus.MENU)} className="bg-transparent border border-white/20 text-white py-3 rounded-lg hover:bg-white/10 transition">Main Menu</button>
                    </div>
                )}
             </div>
          </div>
        )}

        {/* VICTORY */}
        {status === GameStatus.VICTORY && (
          <div className="absolute inset-0 bg-emerald-900/80 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
             <div className="bg-gray-900 p-8 rounded-2xl border border-emerald-500/50 text-center max-w-md w-full shadow-2xl">
                <Trophy size={64} className="mx-auto text-yellow-400 mb-4 animate-bounce" />
                <h2 className="text-3xl font-bold text-white mb-2">Level Complete!</h2>
                <p className="text-emerald-400 mb-6">Excellent foraging!</p>
                
                <div className="bg-black/30 p-4 rounded-lg mb-6 space-y-3">
                   <div className="flex justify-between items-center">
                      <span className="text-gray-400 flex items-center gap-2"><Coin className="text-amber-400"/> Seeds Collected</span>
                      <span className="font-mono font-bold text-white">+{lastRunStats.seeds * 100}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-gray-400 flex items-center gap-2"><Timer className="text-blue-400"/> Time ({lastRunStats.time}s)</span>
                      <span className="font-mono font-bold text-white">+{lastRunStats.timeBonus}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-gray-400 flex items-center gap-2"><Star className="text-yellow-400"/> Level Bonus</span>
                      <span className="font-mono font-bold text-white">+{lastRunStats.levelBonus}</span>
                   </div>
                   <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                      <span className="text-emerald-400 font-bold uppercase text-sm">Total Score</span>
                      <span className="font-mono font-bold text-2xl text-amber-400">{score.toLocaleString()}</span>
                   </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={() => startGame(true)} className="bg-emerald-500 text-white font-bold py-3 rounded-lg hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20">Next Level (Keep Score)</button>
                  <button onClick={quitFromVictory} className="bg-transparent border border-white/20 text-white py-3 rounded-lg hover:bg-white/10 transition">Quit & Save Score</button>
                </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
