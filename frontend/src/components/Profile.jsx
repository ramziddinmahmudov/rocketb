import { motion } from 'framer-motion';
import { User, Copy, Bell, Settings, Rocket, Crown, Star, Swords, Trophy, Target, Users, TrendingUp, TrendingDown } from 'lucide-react';

export default function Profile({ username, balance, isVip, vipEmoji, userId, referralLink, showToast, profileStats }) {
  const stats = profileStats || {
      totalBattles: 0,
      wins: 0,
      winRate: '0%',
      rocketsSpent: '0',
      starsGained: 0,
      referrals: 0,
      vipStatus: isVip ? 'Active' : 'Not VIP'
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(referralLink || `https://t.me/rocketbattleebot?start=${userId}`);
    showToast('📋 Havola nusxalandi!', 'success');
  };

  return (
    <div className="flex flex-col gap-6" style={{ boxSizing: 'border-box' }}>
       
       {/* Header */}
       <div className="flex justify-between items-center mb-6">
           <div className="flex items-center gap-3">
               <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-transparent p-0.5 bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-indigo-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                   <div className="w-full h-full rounded-full bg-gradient-to-tr from-purple-900 to-indigo-900 flex items-center justify-center text-lg font-black text-white drop-shadow-md">
                       {username?.charAt(0).toUpperCase() || 'P'}
                   </div>
               </div>
               <div className="flex flex-col gap-0.5">
                   <h2 className="text-white font-black text-[15px] leading-tight drop-shadow-sm">{username || 'Username'}</h2>
                   <span className="text-indigo-300 text-[11px] font-bold tracking-wider uppercase">@{(username || 'GamerPro').toLowerCase().replace(' ', '')}</span>
               </div>
           </div>
           
           <div className="flex items-center gap-4 text-gray-400">
               <Bell size={20} className="hover:text-white transition-colors cursor-pointer" />
               <Settings size={20} className="hover:text-white transition-colors cursor-pointer" />
           </div>
       </div>

       {/* Rocket Balance Card */}
       <motion.div 
         className="w-full rounded-3xl mb-1 relative overflow-hidden bg-gradient-to-br from-[#1e1b4b]/80 via-[#312e81]/60 to-[#0f172a]/90 backdrop-blur-xl border border-indigo-500/30 shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)]"
         style={{ padding: '20px', boxSizing: 'border-box' }}
       >
           {/* Intense animated gradient glow */}
           <div className="absolute -top-10 -right-10 w-48 h-48 bg-fuchsia-600/30 blur-[50px] rounded-full animate-pulse pointer-events-none" />
           <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-600/30 blur-[50px] rounded-full animate-pulse delay-1000 pointer-events-none" />

           <div className="flex justify-between items-start mb-2 relative z-10">
               <h3 className="text-indigo-200 text-xs font-bold uppercase tracking-widest drop-shadow-md">Rocket Balance</h3>
               <div className="flex items-center gap-1 bg-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold text-amber-500 border border-amber-500/30">
                   <Star size={10} className="fill-amber-500" /> VIP
               </div>
           </div>

           <div className="flex items-center gap-2 mb-4 relative z-10">
               <Rocket size={20} className="text-indigo-400" />
               <span className="text-2xl font-bold text-white">{balance?.toLocaleString() || '0'}</span>
           </div>

           <div className="flex items-center gap-4 relative z-10 border-t border-white/5 pt-3">
               <div className="flex items-center gap-1.5 text-xs text-amber-500">
                   <Crown size={14} /> VIP trial access
               </div>
               <div className="flex items-center gap-1.5 text-xs text-amber-400">
                   <Star size={14} className="fill-amber-400" /> +120 Stars
               </div>
           </div>
       </motion.div>

       {/* Edit Profile Button */}
       <div className="w-full flex justify-center mb-6 mt-2">
         <button className="w-[70%] max-w-[280px] py-4 px-6 rounded-3xl bg-white/5 backdrop-blur-md text-white text-[14px] font-black tracking-widest uppercase border border-white/10 hover:bg-white/10 transition-all active:scale-[0.98] shadow-[0_4px_15px_rgba(0,0,0,0.2)] flex items-center justify-center gap-2">
             EDIT PROFILE
         </button>
       </div>

       {/* Comprehensive Stats Grid */}
       <div className="bg-[#1e2336]/60 backdrop-blur-md rounded-3xl border border-white/5 mb-1 shadow-[0_4px_20px_rgba(0,0,0,0.2)]" style={{ padding: '20px', boxSizing: 'border-box' }}>
           <div className="grid grid-cols-2 gap-y-6 gap-x-4">
               {/* Row 1 */}
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Swords size={18} className="text-indigo-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Total Battles</span>
                       <span className="text-base font-bold text-white">{stats.totalBattles}</span>
                   </div>
               </div>
               
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Trophy size={18} className="text-purple-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Wins</span>
                       <span className="text-base font-bold text-white">{stats.wins}</span>
                   </div>
               </div>

               {/* Row 2 */}
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Target size={18} className="text-emerald-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Win Rate (%)</span>
                       <span className="text-base font-bold text-white">{stats.winRate}</span>
                   </div>
               </div>

               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Rocket size={18} className="text-pink-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Rockets Spent</span>
                       <span className="text-base font-bold text-white">{stats.rocketsSpent}</span>
                   </div>
               </div>

               {/* Row 3 */}
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Star size={18} className="text-amber-500 fill-amber-500" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Stars Gained</span>
                       <span className="text-base font-bold text-white">{stats.starsGained}</span>
                   </div>
               </div>
               
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Users size={18} className="text-cyan-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Referrals</span>
                       <span className="text-base font-bold text-white">{stats.referrals}</span>
                   </div>
               </div>

               {/* Row 4 (Full Width) */}
               <div className="col-span-2 flex items-start gap-3 pt-4 border-t border-white/5 mt-2">
                   <div className="mt-1 opacity-60"><Crown size={18} className="text-amber-500" /></div>
                   <div className="flex flex-col w-full">
                       <span className="text-[11px] text-gray-400 font-medium">VIP Status</span>
                       <span className="text-sm font-bold text-white">{stats.vipStatus}</span>
                   </div>
               </div>
           </div>
       </div>

       {/* Leaderboard Summary */}
       <div className="bg-[#1e2336]/60 backdrop-blur-md rounded-3xl border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.2)]" style={{ padding: '20px', boxSizing: 'border-box' }}>
           <h3 className="text-sm font-bold text-white mb-4 tracking-widest uppercase ml-1">Leaderboard Summary</h3>
           <div className="flex gap-4">
               <div className="flex-1 bg-black/20 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center">
                   <span className="text-[11px] text-gray-400 mb-1">Global Rank</span>
                   <div className="flex items-center gap-1.5">
                       <span className="text-lg font-bold text-white">#{stats.rank || '---'}</span>
                       {stats.rank && <span className="flex items-center text-[10px] text-emerald-400 font-bold"><TrendingUp size={12} /> 1</span>}
                   </div>
               </div>
           </div>
       </div>

     </div>
  );
}
