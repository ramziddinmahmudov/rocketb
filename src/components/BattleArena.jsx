import { motion } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { Share2, ChevronLeft, Trophy } from 'lucide-react';

export default function BattleArena({
  scores,
  isConnected,
  participants,
  currentRound,
  totalRounds,
  currentMatches,
  battleStatus,
  myUserId,
  onSelectTarget,
  onLeaveRoom
}) {
  const [roundTimeLeft, setRoundTimeLeft] = useState(60);
  const [copiedVote, setCopiedVote] = useState(false);

  // Find current user's active match
  const myMatch = useMemo(() => {
    if (!currentMatches || !myUserId) return null;
    return currentMatches.find(
      (m) => m.player1_id === myUserId || m.player2_id === myUserId
    );
  }, [currentMatches, myUserId]);

  // Round countdown timer
  useEffect(() => {
    if (battleStatus !== 'active') return;
    const duration = myMatch?.duration_seconds || 60;
    setRoundTimeLeft(duration);
    const interval = setInterval(() => {
      setRoundTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentRound, battleStatus, myMatch]);

  const handleShareVote = () => {
    if (!myUserId || !scores?.battle_id && !currentMatches?.[0]?.battle_id) return;
    const bid = scores?.battle_id || currentMatches?.[0]?.battle_id || 'unknown';
    const link = `https://t.me/rocketbattleebot?start=vote_${bid}_${myUserId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedVote(true);
      setTimeout(() => setCopiedVote(false), 2000);
    });
  };

  // Mock static bracket representation based on 16 players (4 rounds: 1/8, Quarter, Semi, Final)
  // For production, this needs to traverse currentMatches across all rounds from backend.
  // Rendering an exact 5-level deep horizontal tree (16 -> 8 -> 4 -> 2 -> 1)
  
  const bracketColumns = ['1/8 Final', 'Quarter Final', 'Semi Final', 'Final', 'Champion'];

  return (
    <div className="flex flex-col h-full bg-[#0a0f1c] text-white">
      {/* Header */}
      <div className="flex justify-between items-start p-4">
         <button className="text-gray-400 hover:text-white" onClick={onLeaveRoom}>
            <ChevronLeft size={24} />
         </button>
         <div className="flex flex-col items-center">
             <h2 className="text-lg font-bold uppercase tracking-widest">Tournament Bracket</h2>
         </div>
         <div className="w-6" /> {/* Spacer */}
      </div>

      {/* Top Stats */}
      <div className="flex justify-between px-6 pb-2 mx-2 border-b border-white/5">
         <div className="flex flex-col text-left">
            <span className="text-[10px] text-gray-500 uppercase">Room ID</span>
            <span className="text-sm font-bold">#RB-201</span>
         </div>
         <div className="flex flex-col text-center">
            <span className="text-[10px] text-gray-500 uppercase">Prize Pool</span>
            <span className="text-sm font-bold text-amber-500">2m 15s</span>
         </div>
         <div className="flex flex-col text-right">
            <span className="text-[10px] text-gray-500 uppercase">Prize Pool</span>
            <span className="text-sm font-bold">$20,000</span>
         </div>
      </div>

      {/* Deep Bracket Scroll Area */}
      <div className="flex-1 overflow-x-auto overflow-y-auto px-4 py-8 custom-scrollbar">
         
         {/* Column Headers */}
         <div className="flex min-w-max gap-12 mb-8 px-4">
            {bracketColumns.map((col, idx) => (
               <div key={idx} className="w-24 text-center text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                  {col}
               </div>
            ))}
         </div>

         {/* Tree Container */}
         <div className="flex min-w-max gap-12 px-4 relative pb-16">
            
            {/* Round 1 (1/8 Final) - 8 matches */}
            <div className="flex flex-col gap-4 w-24">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={`r1-${i}`} className="flex flex-col gap-1 items-center justify-center relative h-16">
                        <PlayerNode name={`Player ${i*2+1}`} />
                        <PlayerNode name={`Player ${i*2+2}`} />
                        {/* Connection line to next round */}
                        <div className="absolute -right-6 top-1/2 w-6 border-t-2 border-purple-500/30" />
                        {i % 2 === 0 ? (
                            <div className="absolute -right-6 top-1/2 w-0 h-[88px] border-r-2 border-purple-500/30" />
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Round 2 (Quarter Final) - 4 matches */}
            <div className="flex flex-col justify-around w-24">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`r2-${i}`} className="flex flex-col gap-1 items-center justify-center relative h-32">
                        <PlayerNode name={`Winner`} highlighted={i === 0} status={i===0 ? "Completed" : ""} />
                        <div className="absolute -left-6 top-1/2 w-6 border-t-2 border-purple-500/30" />
                        <div className="absolute -right-6 top-1/2 w-6 border-t-2 border-purple-500/30" />
                        {i % 2 === 0 ? (
                            <div className="absolute -right-6 top-1/2 w-0 h-[150px] border-r-2 border-indigo-500/50" />
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Round 3 (Semi Final) - 2 matches */}
            <div className="flex flex-col justify-around w-24">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={`r3-${i}`} className="flex flex-col gap-1 items-center justify-center relative h-64">
                         <PlayerNode name={`Semi`} highlighted={i === 0} status={i===0 ? "Upcoming" : ""} />
                         <div className="absolute -left-6 top-1/2 w-6 border-t-2 border-indigo-500/50" />
                         <div className="absolute -right-6 top-1/2 w-6 border-t-2 border-indigo-500/50" />
                         {i % 2 === 0 ? (
                            <div className="absolute -right-6 top-1/2 w-0 h-[280px] border-r-2 border-amber-500/50" />
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Round 4 (Final) - 1 match */}
            <div className="flex flex-col justify-around w-24">
                 <div className="flex flex-col gap-1 items-center justify-center relative h-full">
                     <PlayerNode name={`Finalist`} isGold={true} />
                     <div className="absolute -left-6 top-1/2 w-6 border-t-2 border-amber-500/50" />
                     <div className="absolute -right-6 top-1/2 w-6 border-t-2 border-amber-500/50" />
                 </div>
            </div>

            {/* Champion */}
            <div className="flex flex-col justify-around w-24">
                 <div className="flex flex-col gap-2 items-center justify-center relative h-full">
                     <div className="absolute -left-6 top-1/2 w-6 border-t-2 border-amber-500/50" />
                     <Trophy size={48} className="text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
                     <span className="text-amber-500 font-bold text-sm drop-shadow-md">Champion</span>
                 </div>
            </div>

         </div>
      </div>

      {/* Bottom Information & Action */}
      <div className="p-4 pt-0 mt-auto flex flex-col gap-4 bg-gradient-to-t from-[#0a0f1c] to-transparent">
          <p className="text-xs text-center text-gray-300 px-4 leading-relaxed">
             Turnir jadvalini gorizontal ko'rinishda ko'rsatish va har bir match natijasini chuqurroq ko'rish imkoniyati.
          </p>
          <button 
             onClick={handleShareVote}
             className="w-full py-4 rounded-xl text-white text-sm font-bold uppercase transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
             style={{ background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
          >
              SHARE YOUR BRACKET LINK <Share2 size={16} />
          </button>
      </div>

    </div>
  );
}

// Sub-component for rendering a player node in the bracket
function PlayerNode({ name, highlighted, isGold, status }) {
    return (
        <div className="flex flex-col items-center gap-1 z-10 bg-[#0a0f1c]">
            <div className={`w-10 h-10 rounded-full border-2 p-0.5 ${isGold ? 'border-amber-500 shadow-[0_0_10px_#f59e0b]' : highlighted ? 'border-indigo-400 shadow-[0_0_10px_#818cf8]' : 'border-purple-500/30'} bg-[#0f172a]`}>
                <div className="w-full h-full rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] text-gray-300">
                    {name.charAt(0)}
                </div>
            </div>
            <span className="text-[9px] text-gray-400 max-w-[48px] truncate text-center">{name}</span>
            {status && (
                <span className={`text-[8px] font-bold mt-0.5 ${status === 'Completed' ? 'text-gray-500' : 'text-amber-500'}`}>
                    {status}
                </span>
            )}
        </div>
    );
}
