import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Share2, Loader } from 'lucide-react';
import { api } from '../api/client';

export default function Leaderboard({ myUserId, showToast }) {
  const [entries, setEntries] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Global');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, [activeTab]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const { data } = await api.getLeaderboard();
      setEntries(data.entries || []);
      setMyRank(data.my_rank);
      setMyScore(data.my_score);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    const text = `🏆 Mening reytingim #${myRank} — Rocket Battle o'yinida! 🚀`;
    const link = `https://t.me/rocketbattleebot?start=ref_${myUserId}`;
    
    if (window.Telegram?.WebApp?.openTelegramLink) {
       window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    } else {
       navigator.clipboard.writeText(`${text}\n${link}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
       });
    }
  };

  // Top 3 for podium display
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Arrange podium order: 2nd, 1st, 3rd
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumLabels = top3.length >= 3 ? ['Silver', 'Gold', 'Bronze'] : [];
  const podiumColors = ['#94a3b8', '#f59e0b', '#cd7f32'];
  const podiumSizes = [56, 72, 56];

  return (
    <div className="flex flex-col h-full bg-[#0a0f1c] text-white overflow-y-auto pb-24 custom-scrollbar">
       
       {/* Header */}
       <div className="text-center pt-6 pb-2">
          <h1 className="text-xl font-bold uppercase tracking-[0.15em]">Leaderboard</h1>
       </div>

       {/* Tab Switcher */}
       <div className="flex justify-center gap-2 px-8 mb-6">
          {['Global', 'Regional', 'Last Season'].map(t => (
             <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeTab === t ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-gray-500 border-transparent hover:bg-white/5'}`}
             >
                {t}
             </button>
          ))}
       </div>

       {/* My Current Rank */}
       <div className="mx-6 mb-6 bg-[#0f172a] border border-white/5 rounded-2xl p-4 text-center">
          <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">My Current Rank:</span>
          <div className="flex items-center justify-center gap-2 mt-1">
             <span className="text-3xl font-black text-white">#{myRank || '—'}</span>
             {myRank && (
                <TrendingUp size={16} className="text-emerald-400" />
             )}
          </div>
       </div>

       {loading ? (
          <div className="flex justify-center py-12">
             <Loader className="animate-spin text-indigo-500" size={28} />
          </div>
       ) : (
          <>
             {/* Podium (Top 3) */}
             {top3.length >= 3 && (
                <div className="flex justify-center items-end gap-4 px-6 mb-8">
                   {podiumOrder.map((entry, idx) => {
                      const isCenter = idx === 1;
                      const label = podiumLabels[idx];
                      const color = podiumColors[idx];
                      const size = podiumSizes[idx];

                      return (
                         <motion.div 
                            key={entry.user_id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="flex flex-col items-center gap-2"
                         >
                            <div 
                               className="rounded-full overflow-hidden border-2 p-0.5 bg-[#0f172a]"
                               style={{ 
                                  width: size, height: size, 
                                  borderColor: color,
                                  boxShadow: `0 0 15px ${color}40`
                               }}
                            >
                               <div 
                                  className="w-full h-full rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-indigo-500/30 to-purple-500/30"
                                  style={{ fontSize: isCenter ? 20 : 16 }}
                               >
                                  {(entry.username || 'P').charAt(0).toUpperCase()}
                               </div>
                            </div>
                            <span className="text-xs font-bold text-white/90 max-w-[60px] truncate">
                               @{entry.username || 'User'}
                            </span>
                            <span className="text-[10px] font-semibold" style={{ color }}>
                               {label}
                            </span>
                         </motion.div>
                      );
                   })}
                </div>
             )}

             {/* Leaderboard List */}
             <div className="flex flex-col gap-2 px-4">
                {(top3.length < 3 ? entries : rest).map((entry, idx) => {
                   const rank = top3.length < 3 ? idx + 1 : idx + 4;
                   const isMe = entry.user_id === myUserId;

                   return (
                      <motion.div
                         key={entry.user_id}
                         initial={{ opacity: 0, x: -20 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: idx * 0.03 }}
                         className={`flex items-center gap-3 py-3 px-4 rounded-xl transition-all ${isMe ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-[#0f172a] border border-white/5'}`}
                      >
                         <span className={`text-sm font-bold w-6 text-center ${isMe ? 'text-indigo-400' : 'text-gray-500'}`}>
                            #{rank}
                         </span>

                         <div className="w-8 h-8 rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-xs font-bold text-gray-300">
                            {(entry.username || 'P').charAt(0).toUpperCase()}
                         </div>

                         <div className="flex-1 min-w-0">
                            <span className={`text-sm font-semibold truncate block ${isMe ? 'text-indigo-300' : 'text-white/90'}`}>
                               @{entry.username || 'User'}
                            </span>
                         </div>

                         <div className="flex items-center gap-1">
                            <Trophy size={14} className="text-amber-500" />
                            <span className="text-sm font-bold text-white">{entry.score}</span>
                         </div>
                      </motion.div>
                   );
                })}
             </div>
          </>
       )}

       {/* Bottom Share CTA */}
       <div className="p-4 mt-auto bg-gradient-to-t from-[#0a0f1c] to-transparent pt-6">
          <button 
             onClick={handleShare}
             className="w-full py-4 rounded-xl text-white text-sm font-bold uppercase transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
             style={{ background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
          >
             {copied ? 'NUSXALANDI!' : 'SHARE YOUR RANK & PROGRESS'} <Trophy size={16} />
          </button>
       </div>

    </div>
  );
}
