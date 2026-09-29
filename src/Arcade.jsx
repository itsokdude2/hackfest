import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Play, ArrowLeft, Gamepad2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import StackGame from './StackGame';
import CrossyRoadGame from './CrossyRoadGame';
import GlassAscentGame from './GlassAscentGame';
import WhackAMoleGame from './WhackAMoleGame';
import FlatlineGame from './FlatlineGame';
import HexUltraGame from './HexUltraGame';

/* --- ArcadeDashboard --- */
// Reuse GlassCard styled container or similar UI
const GlassCard = ({ children, className = "", delay = 0, onClick }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay }}
      onClick={onClick}
      className={`
        relative overflow-hidden
        bg-white/40 backdrop-blur-md
        border border-white/60
        shadow-xl
        rounded-3xl
        will-change-transform
        ${className}
      `}
    >
        {/* Shine effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10 h-full w-full">
            {children}
        </div>
    </motion.div>
  );
};

// Custom SVG Icon for Stacker 3D
const StackerIcon = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        {/* Base Block */}
        <path d="M50 75L20 60L50 45L80 60L50 75Z" fill="#4F46E5"/>
        <path d="M20 60V75L50 90V75L20 60Z" fill="#4338CA"/>
        <path d="M80 60V75L50 90V75L80 60Z" fill="#3730A3"/>

        {/* Middle Block */}
        <path d="M50 55L20 40L50 25L80 40L50 55Z" fill="#818CF8"/>
        <path d="M20 40V55L50 70V55L20 40Z" fill="#6366F1"/>
        <path d="M80 40V55L50 70V55L80 40Z" fill="#4F46E5"/>

        {/* Top Block */}
        <path d="M50 35L20 20L50 5L80 20L50 35Z" fill="#A5B4FC"/>
        <path d="M20 20V35L50 50V35L20 20Z" fill="#818CF8"/>
        <path d="M80 20V35L50 50V35L80 20Z" fill="#6366F1"/>
    </svg>
);

// Custom SVG Icon for Crossy Road
const ChickenIcon = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        {/* Grass Background */}
        <rect x="10" y="60" width="80" height="20" rx="4" fill="#2d5a27"/>

        {/* Chicken Body */}
        <rect x="35" y="30" width="30" height="30" rx="4" fill="#ffffff"/>

        {/* Beak */}
        <path d="M65 40L75 45L65 50V40Z" fill="#f1c40f"/>

        {/* Eye */}
        <circle cx="58" cy="40" r="3" fill="#2c3e50"/>

        {/* Comb */}
        <path d="M45 30V20L55 30H45Z" fill="#e74c3c"/>

        {/* Legs */}
        <path d="M42 60V70" stroke="#e67e22" strokeWidth="3"/>
        <path d="M58 60V70" stroke="#e67e22" strokeWidth="3"/>
    </svg>
);

// Custom SVG Icon for Glass Ascent
const GlassAscentIcon = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        {/* Background Shaft */}
        <rect x="25" y="10" width="50" height="80" rx="4" fill="#1e293b" opacity="0.1"/>

        {/* Platform 1 */}
        <rect x="30" y="70" width="40" height="8" rx="2" fill="#4f46e5" opacity="0.6"/>

        {/* Platform 2 */}
        <rect x="40" y="45" width="40" height="8" rx="2" fill="#4f46e5" opacity="0.8"/>

        {/* Platform 3 */}
        <rect x="20" y="20" width="40" height="8" rx="2" fill="#4f46e5"/>

        {/* Player - Jumping */}
        <circle cx="50" cy="35" r="8" fill="#6366f1"/>

        {/* Motion lines */}
        <path d="M45 42L42 50" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
        <path d="M55 42L58 50" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
    </svg>
);

// Custom SVG Icon for Whack-A-Mole
const WhackAMoleIcon = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        {/* Ground */}
        <ellipse cx="50" cy="80" rx="40" ry="15" fill="#5d4037" />

        {/* Hole */}
        <ellipse cx="50" cy="80" rx="30" ry="10" fill="#2d1b15" />

        {/* Mole */}
        <path d="M 30 80 Q 30 30 50 30 Q 70 30 70 80" fill="#8d6e63" />
        <ellipse cx="45" cy="45" rx="3" ry="5" fill="#111" />
        <ellipse cx="55" cy="45" rx="3" ry="5" fill="#111" />
        <ellipse cx="50" cy="55" rx="6" ry="4" fill="#3e2723" />

        {/* Hammer */}
        <g transform="translate(60, 20) rotate(30)">
             <rect x="0" y="0" width="10" height="40" fill="#94a3b8" stroke="#64748b" strokeWidth="2" />
             <rect x="-15" y="-15" width="40" height="20" fill="#6366f1" stroke="#312e81" strokeWidth="2" rx="4" />
        </g>
    </svg>
);

// Custom SVG Icon for Flatline
const FlatlineIcon = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        <rect width="100" height="100" fill="#f0f2f5" rx="10" />
        <path d="M10 50 H90" stroke="#ff3333" strokeWidth="2" strokeDasharray="5 5" />
        <text x="50" y="60" textAnchor="middle" fill="#1a1a1a" fontSize="40" fontFamily="monospace" fontWeight="bold">KEY</text>
    </svg>
);

// Custom SVG Icon for Hex Ultra
const HexUltraIcon = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        <rect width="100" height="100" fill="#f8fafc" rx="10" />
        <path d="M50 20 L80 35 L80 65 L50 80 L20 65 L20 35 Z" stroke="#4f46e5" strokeWidth="4" fill="none" />
        <circle cx="50" cy="50" r="5" fill="#1e1b4b" />
        <path d="M50 50 L65 42" stroke="#4f46e5" strokeWidth="2" />
    </svg>
);

const GAMES = [
    {
        id: 'stacker3d',
        title: 'Stacker 3D',
        description: 'Stack blocks to build the tallest tower. Precision is key!',
        icon: <StackerIcon />,
        component: StackGame
    },
    {
        id: 'crossyroad',
        title: 'Crossy Road',
        description: 'Hop across endless roads, rivers, and train tracks. Don\'t get squashed!',
        icon: <ChickenIcon />,
        component: CrossyRoadGame
    },
    {
        id: 'glassascent',
        title: 'Glass Ascent',
        description: 'Ascend the Cyber Shaft. Watch out for rising lava and conserve your energy!',
        icon: <GlassAscentIcon />,
        component: GlassAscentGame
    },
    {
        id: 'whackamole',
        title: 'Whack-a-Mole',
        description: 'Hit the moles, build your streak, and test your reflexes in this classic arcade game!',
        icon: <WhackAMoleIcon />,
        component: WhackAMoleGame
    },
    {
        id: 'flatline',
        title: 'Flatline',
        description: 'Type fast. Don\'t breach the red line. A high-stakes typing endurance test.',
        icon: <FlatlineIcon />,
        component: FlatlineGame
    },
    {
        id: 'hexultra',
        title: 'Hex Ultra',
        description: 'Survive the collapsing hexagon. Rhythm-based evasion game.',
        icon: <HexUltraIcon />,
        component: HexUltraGame
    }
];

const LeaderboardModal = ({ onClose }) => {
    const [rankings, setRankings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAllScores = async () => {
            try {
                // Map of userEmail -> { info, scores: { gameId: score }, total: 0 }
                const userMap = {};

                for (const game of GAMES) {
                    const q = query(
                        collection(db, 'arcade_scores', game.id, 'scores'),
                        orderBy('score', 'desc'),
                        limit(100) // Limit to top 100 per game to prevent overloading
                    );
                    const snapshot = await getDocs(q);

                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        const email = data.userEmail;

                        if (!userMap[email]) {
                            userMap[email] = {
                                userName: data.userName,
                                userEmail: email,
                                scores: {}
                            };
                        }

                        // Store score for this game
                        userMap[email].scores[game.id] = data.score;
                    });
                }

                // Calculate Final Score for each user
                const leaderboardData = Object.values(userMap).map(user => {
                    let totalScore = 0;
                    GAMES.forEach(game => {
                        totalScore += (user.scores[game.id] || 0);
                    });

                    const finalScore = totalScore / GAMES.length;

                    return {
                        ...user,
                        finalScore
                    };
                });

                // Sort by Final Score descending
                leaderboardData.sort((a, b) => b.finalScore - a.finalScore);

                setRankings(leaderboardData);
            } catch (err) {
                console.error("Error fetching leaderboard", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllScores();
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden relative flex flex-col max-h-[90vh]"
            >
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
                     <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Trophy className="text-yellow-500" /> Global Leaderboard
                     </h3>
                     <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-x-auto overflow-y-auto p-0 custom-scrollbar">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">Loading scores...</div>
                    ) : rankings.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">No scores yet. Be the first!</div>
                    ) : (
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead className="sticky top-0 bg-white z-10 text-xs font-bold text-gray-400 uppercase shadow-sm">
                                <tr>
                                    <th className="p-4 text-center">Rank</th>
                                    <th className="p-4">Player</th>
                                    {GAMES.map(g => (
                                        <th key={g.id} className="p-4 text-right text-indigo-400 whitespace-nowrap">
                                            {g.title}
                                        </th>
                                    ))}
                                    <th className="p-4 text-right text-indigo-700 bg-indigo-50">Final Score</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {rankings.map((user, idx) => (
                                    <tr key={idx} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx < 3 ? 'font-semibold' : ''}`}>
                                        <td className="p-4 text-center w-16">
                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                        </td>
                                        <td className="p-4 truncate max-w-[150px] font-medium text-gray-800">
                                            {user.userName}
                                        </td>
                                        {GAMES.map(g => (
                                            <td key={g.id} className="p-4 text-right text-gray-500 font-mono">
                                                {(user.scores[g.id] || 0).toLocaleString()}
                                            </td>
                                        ))}
                                        <td className="p-4 text-right font-black text-indigo-600 font-mono text-lg bg-indigo-50/50">
                                            {user.finalScore.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-3 text-center text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                    Final Score = Average of all game scores
                </div>
            </motion.div>
        </div>
    );
};

const ArcadeDashboard = ({ user, customUserName }) => {
  const [activeGame, setActiveGame] = useState(null);
  const [personalScores, setPersonalScores] = useState({});
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Ref to hold the latest scores for immediate race-condition checks
  const personalScoresRef = useRef({});

  useEffect(() => {
      // Sync ref whenever state updates
      personalScoresRef.current = personalScores;
  }, [personalScores]);

  useEffect(() => {
      // Fetch personal high scores for all games
      const fetchPersonalScores = async () => {
          if (!user) return;
          const newScores = {};

          for (const game of GAMES) {
              try {
                  const docRef = doc(db, 'arcade_scores', game.id, 'scores', user.email);
                  const docSnap = await getDoc(docRef);
                  if (docSnap.exists()) {
                      newScores[game.id] = docSnap.data().score;
                  }
              } catch (e) {
                  console.error(`Error fetching score for ${game.id}`, e);
              }
          }
          setPersonalScores(newScores);
      };
      fetchPersonalScores();
  }, [user, activeGame]); // Refetch when game closes to update score

  const handleGameOver = async (gameId, score) => {
      if (!user) return;

      try {
          // Check against the REF (latest known score including optimistic updates)
          const currentHigh = personalScoresRef.current[gameId] || 0;

          if (score > currentHigh) {
              // Optimistic Update immediately to prevent race conditions from rapid replays
              personalScoresRef.current = { ...personalScoresRef.current, [gameId]: score };
              setPersonalScores(prev => ({ ...prev, [gameId]: score }));

              const docRef = doc(db, 'arcade_scores', gameId, 'scores', user.email);
              await setDoc(docRef, {
                  userId: user.uid,
                  userName: customUserName || user.displayName || user.email.split('@')[0],
                  userEmail: user.email,
                  score: score,
                  timestamp: new Date().toISOString()
              });

              // Log action
              await addDoc(collection(db, 'logs'), {
                  userId: user.uid,
                  userEmail: user.email,
                  userName: customUserName || user.displayName || user.email,
                  role: 'arcade_player',
                  action: 'ARCADE_HIGHSCORE',
                  details: `New High Score in ${gameId}: ${score}`,
                  timestamp: new Date().toISOString()
              });
          }
      } catch (err) {
          console.error("Error saving score", err);
      }
  };

  const GameComponent = activeGame ? GAMES.find(g => g.id === activeGame)?.component : null;

  if (activeGame && GameComponent) {
      return (
          <div className="fixed inset-0 z-[200] bg-zinc-900">
              <GameComponent
                onExit={() => setActiveGame(null)}
                onGameOver={(score) => handleGameOver(activeGame, score)}
              />
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col p-0 overflow-hidden max-w-7xl mx-auto w-full">
        {showLeaderboard && (
            <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar p-6 md:p-10 pb-20 flex-1 min-h-0 auto-rows-max">
            {GAMES.map(game => (
                <GlassCard key={game.id} className="p-0 flex flex-col group hover:shadow-2xl transition-all h-full min-h-[260px] max-h-[350px]">
                    <div className="h-24 md:h-32 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-inner shrink-0">
                        <div className="scale-75 md:scale-100 transition-transform">
                             {game.icon}
                        </div>
                    </div>
                    <div className="p-4 md:p-6 flex-1 flex flex-col min-h-0">
                        <div className="flex justify-between items-start mb-2 shrink-0">
                             <h3 className="text-lg md:text-xl font-bold text-gray-800">{game.title}</h3>
                             <div className="text-right">
                                 <p className="text-[10px] text-gray-400 font-bold uppercase">Best Score</p>
                                 <p className="text-base md:text-lg font-black text-indigo-600">
                                     {(personalScores[game.id] || 0).toLocaleString()}
                                 </p>
                             </div>
                        </div>
                        
                        <div className="flex-1 min-h-0 mb-4 overflow-hidden">
                             <p className="text-gray-500 text-xs md:text-sm line-clamp-3">{game.description}</p>
                        </div>

                        <div className="flex gap-2 mt-auto shrink-0">
                            <button
                                onClick={() => setActiveGame(game.id)}
                                className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Play size={18} fill="currentColor" /> Play
                            </button>
                            <button
                                onClick={() => setShowLeaderboard(true)}
                                className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-colors"
                                title="Global Leaderboard"
                            >
                                <Trophy size={18} />
                            </button>
                        </div>
                    </div>
                </GlassCard>
            ))}


        </div>
    </div>
  );
};

export default ArcadeDashboard;
