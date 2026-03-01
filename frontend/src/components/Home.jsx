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
    <div className="home-container p-4 pb-24 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
      
      {/* Platform Title */}
      <div className="text-center mt-2">
         <h2 className="text-lg font-bold text-white/90">Asosiy Sahifa</h2>
      </div>

      {/* Rocket Balance Card */}
      <motion.div 
        className="glass-card p-5 relative overflow-hidden flex flex-col gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex justify-between items-center z-10">
           <h3 className="text-gray-300 font-semibold text-sm">Rocket Balance Card</h3>
           {isVip && (
             <div className="bg-amber-500/20 border border-amber-500/50 text-amber-500 text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1">
               <Crown size={12} /> VIP
             </div>
           )}
        </div>
        <div className="flex items-center gap-2 mt-2 z-10">
            <Rocket size={24} className="text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
            <span className="text-3xl font-black text-white tracking-wider font-['Outfit']">
                {balance.toLocaleString()}
            </span>
        </div>
        <div className="absolute right-[-20px] top-[-20px] opacity-10 pointer-events-none">
           <Rocket size={120} />
        </div>
      </motion.div>

      {/* Active Tournament Card */}
      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-base text-white/90">Active Tournament Card</h3>
        <motion.div 
          className="rounded-2xl p-5 border border-purple-500/30 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(30,27,75,0.8) 0%, rgba(88,28,135,0.4) 100%)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
           <h4 className="text-center font-bold text-xl text-white mb-4">Zone B</h4>
           <div className="flex justify-between items-center mb-6">
              {/* Left slot */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-14 h-14 rounded-xl bg-indigo-900/50 flex items-center justify-center border border-indigo-500/30 relative">
                   <Shield size={28} className="text-indigo-400" />
                   <span className="absolute font-black text-xl text-indigo-200">B</span>
                </div>
                <span className="text-xs text-indigo-300">Zone B</span>
              </div>
              
              {/* Center */}
              <div className="flex flex-col items-center z-10">
                 <span className="text-xs text-gray-400">Countdown</span>
                 <span className="text-lg font-black text-pink-500">1m 32s</span>
                 <span className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Opponent</span>
              </div>

              {/* Right slot */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-purple-500/50">
                    <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Aleksey" className="w-full h-full object-cover" />
                </div>
                <span className="text-xs text-purple-300 font-medium">Aleksey</span>
              </div>
           </div>
           
           <button className="w-full py-3 rounded-xl font-bold text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all active:scale-95"
                   style={{ background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)' }}>
               ENTER MATCH
           </button>
        </motion.div>
      </div>

      {/* Quick Stats */}
      <div className="flex flex-col gap-2">
         <h3 className="font-bold text-base text-white/90">Quick Stats</h3>
         <motion.div 
           className="glass-card p-4 grid grid-cols-3 gap-2 divide-x divide-white/10"
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2 }}
         >
            <div className="flex flex-col items-center justify-center gap-1">
               <span className="text-[10px] sm:text-xs text-gray-400 text-center">Total Wins</span>
               <span className="text-xl sm:text-2xl font-black text-white">{quickStats.wins}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1">
               <span className="text-[10px] sm:text-xs text-gray-400 text-center">Streak</span>
               <span className="text-xl sm:text-2xl font-black text-white">{quickStats.streak}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1">
               <span className="text-[10px] sm:text-xs text-gray-400 text-center">Global Rank</span>
               <span className="text-xl sm:text-2xl font-black text-white">{quickStats.rank}</span>
            </div>
         </motion.div>
      </div>

    </div>
  );
}
