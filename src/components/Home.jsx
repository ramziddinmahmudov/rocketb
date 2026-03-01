import { motion } from 'framer-motion';
import { Rocket, Shield, Crown } from 'lucide-react';

export default function Home({ balance, isVip, vipEmoji }) {
  // Mock data for now
  const quickStats = {
    wins: 89,
    streak: 5,
    rank: 412
  };

  return (
    <div className="home-container px-6 pt-6 pb-28 flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">
      
      {/* Platform Title */}
      <div className="text-center mt-2">
         <h2 className="text-lg font-bold text-white/90">Asosiy Sahifa</h2>
      </div>

      {/* Rocket Balance Card */}
      <motion.div 
        className="rounded-3xl p-6 relative overflow-hidden flex flex-col gap-3 bg-gradient-to-br from-[#1e1b4b]/80 via-[#312e81]/60 to-[#0f172a]/90 backdrop-blur-xl border border-indigo-500/30 shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Animated Orbs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-fuchsia-600/30 blur-[50px] rounded-full animate-pulse pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-600/30 blur-[50px] rounded-full animate-pulse delay-1000 pointer-events-none" />

        <div className="flex justify-between items-center z-10 relative">
           <h3 className="text-indigo-200 text-xs font-bold uppercase tracking-widest drop-shadow-md">Rocket Balance</h3>
           {isVip && (
             <div className="bg-amber-500/20 border border-amber-500/50 text-amber-500 text-[10px] px-2 py-0.5 rounded flex items-center gap-1 shadow-[0_0_10px_rgba(251,191,36,0.2)]">
               <Crown size={12} className="drop-shadow-sm" /> VIP
             </div>
           )}
        </div>
        <div className="flex items-center gap-3 mt-3 z-10 relative">
            <Rocket size={28} className="text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
            <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-100 to-purple-200 tracking-wider">
                {balance.toLocaleString()}
            </span>
        </div>
        <div className="absolute right-[-40px] top-[-40px] opacity-[0.03] pointer-events-none rotate-45">
           <Rocket size={140} />
        </div>
      </motion.div>

      {/* Active Tournament Card */}
      <div className="flex flex-col gap-3">
        <h3 className="font-bold text-base text-white/90 px-2">Active Tournament Card</h3>
        <motion.div 
          className="rounded-3xl p-6 border border-fuchsia-500/30 relative overflow-hidden shadow-[0_15px_40px_-15px_rgba(168,85,247,0.5)]"
          style={{ background: 'linear-gradient(135deg, rgba(30,27,75,0.9) 0%, rgba(134,25,143,0.5) 100%)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none mix-blend-overlay" />

           <h4 className="text-center font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-200 to-fuchsia-400 mb-4 drop-shadow-lg relative z-10 tracking-widest uppercase">Zone B</h4>
           <div className="flex justify-between items-center mb-5 relative z-10">
              {/* Left slot */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-2xl bg-indigo-900/60 flex items-center justify-center border border-indigo-400/40 relative shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                   <Shield size={28} className="text-indigo-400 drop-shadow-md" />
                   <span className="absolute font-black text-xl text-indigo-100">B</span>
                </div>
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest drop-shadow-sm">Zone B</span>
              </div>
              
              {/* Center */}
              <div className="flex flex-col items-center z-10 bg-black/30 px-4 py-2 rounded-xl border border-white/5">
                 <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Countdown</span>
                 <span className="text-xl font-black text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)] tracking-wider">1m 32s</span>
                 <span className="text-[9px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Opponent</span>
              </div>

              {/* Right slot */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-fuchsia-500/60 shadow-[0_0_20px_rgba(192,38,211,0.4)] relative">
                    <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Aleksey" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-fuchsia-900/50 to-transparent mix-blend-overlay" />
                </div>
                <span className="text-[10px] font-bold text-fuchsia-200 uppercase tracking-widest drop-shadow-sm">Aleksey</span>
              </div>
           </div>
           
           <button className="relative w-full py-3 rounded-xl font-black text-white text-xs tracking-widest uppercase shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:shadow-[0_0_30px_rgba(168,85,247,0.7)] transition-all active:scale-[0.98] bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 z-10">
               Enter Match
           </button>
        </motion.div>
      </div>

      {/* Quick Stats */}
      <div className="flex flex-col gap-3">
         <h3 className="font-bold text-base text-white/90 px-2">Quick Stats</h3>
         <motion.div 
           className="rounded-3xl p-5 grid grid-cols-3 gap-4 bg-[#1e2336]/60 backdrop-blur-md border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] divide-x divide-white/5"
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2 }}
         >
            <div className="flex flex-col items-center justify-center gap-1.5 px-2">
               <span className="text-[9px] sm:text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest">Total Wins</span>
               <span className="text-2xl sm:text-3xl font-black text-white drop-shadow-md tracking-tight">{quickStats.wins}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1.5 px-2">
               <span className="text-[9px] sm:text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest">Streak</span>
               <span className="text-2xl sm:text-3xl font-black text-white drop-shadow-md tracking-tight">{quickStats.streak}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1.5 px-2">
               <span className="text-[9px] sm:text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest">Global Rank</span>
               <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)] tracking-tight">#{quickStats.rank}</span>
            </div>
         </motion.div>
      </div>

    </div>
  );
}
