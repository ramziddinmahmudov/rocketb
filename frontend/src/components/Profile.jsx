import { motion } from 'framer-motion';
import { User, Copy, Bell, Settings, Rocket, Crown, Star, Swords, Trophy, Target, Users, TrendingUp, TrendingDown } from 'lucide-react';

export default function Profile({ username, isVip, vipEmoji, userId, referralLink, showToast }) {
  // Mock Data aligned with screenshot
  const stats = {
      totalBattles: 197,
      wins: 5,
      winRate: '56%',
      rocketsSpent: '2,450',
      starsGained: 120,
      referrals: 1,
      vipStatus: 'Active, ends in 3 days'
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(referralLink || `https://t.me/rocketbattleebot?start=${userId}`);
    showToast('📋 Havola nusxalandi!', 'success');
  };

  return (
    <div className="flex flex-col gap-6 w-full text-white pb-6">
       
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
         initial={{ opacity: 0, scale: 0.95 }}
         animate={{ opacity: 1, scale: 1 }}
         className="w-full rounded-3xl p-6 mb-5 relative overflow-hidden bg-gradient-to-br from-[#1e1b4b]/80 via-[#312e81]/60 to-[#0f172a]/90 backdrop-blur-xl border border-indigo-500/30 shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)]"
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
               <span className="text-2xl font-bold text-white">2,450</span>
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
       <button className="w-full py-4 mb-6 rounded-xl bg-white/5 backdrop-blur-sm text-white text-sm font-black tracking-widest border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all active:scale-[0.98] shadow-[0_5px_15px_-5px_rgba(255,255,255,0.1)]">
           EDIT PROFILE
       </button>

       {/* Comprehensive Stats Grid */}
       <div className="bg-[#1e2336]/60 backdrop-blur-md rounded-3xl p-6 border border-white/5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
           <div className="grid grid-cols-2 gap-y-6 gap-x-6">
               {/* Row 1 */}
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Swords size={18} className="text-indigo-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Total Battles</span>
                       <span className="text-base font-bold text-white">{stats.totalBattles}</span>
                   </div>
               </div>
               
               <div className="flex justify-between">
                   <div className="flex items-start gap-3">
                       <div className="mt-1 opacity-60"><Trophy size={18} className="text-purple-400" /></div>
                       <div className="flex flex-col">
                           <span className="text-[11px] text-gray-400 font-medium">Wins</span>
                           <span className="text-base font-bold text-white">{stats.wins}</span>
                       </div>
                   </div>
                   <div className="flex items-start gap-3 justify-end text-right">
                       <div className="mt-1 opacity-60"><Target size={18} className="text-indigo-400" /></div>
                       <div className="flex flex-col">
                           <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">Win Rate (%)</span>
                           <span className="text-base font-bold text-white text-left">{stats.winRate}</span>
                       </div>
                   </div>
               </div>

               {/* Row 2 */}
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Rocket size={18} className="text-indigo-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Total Rockets Spent</span>
                       <span className="text-base font-bold text-white">{stats.rocketsSpent}</span>
                   </div>
               </div>
               
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Star size={18} className="text-purple-400 fill-purple-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Total Stars Gaind</span>
                       <span className="text-base font-bold text-white">{stats.starsGained}</span>
                   </div>
               </div>

               {/* Row 3 */}
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Star size={18} className="text-amber-500 fill-amber-500" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Total Stars Gained</span>
                       <span className="text-base font-bold text-white">{stats.starsGained}</span>
                   </div>
               </div>
               
               <div className="flex items-start gap-3">
                   <div className="mt-1 opacity-60"><Users size={18} className="text-indigo-400" /></div>
                   <div className="flex flex-col">
                       <span className="text-[11px] text-gray-400 font-medium">Referral Count</span>
                       <span className="text-base font-bold text-white">{stats.referrals}</span>
                   </div>
               </div>

               {/* Row 4 (Full Width) */}
               <div className="col-span-2 flex items-start gap-3 pt-2 border-t border-white/5">
                   <div className="mt-1 opacity-60"><Crown size={18} className="text-amber-500" /></div>
                   <div className="flex flex-col w-full">
                       <span className="text-[11px] text-gray-400 font-medium">VIP Status</span>
                       <span className="text-sm font-bold text-white">{stats.vipStatus}</span>
                   </div>
               </div>

           </div>
       </div>

       {/* Leaderboard Summary */}
       <div className="bg-[#1e2336]/60 backdrop-blur-md rounded-3xl p-5 border border-white/5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
           <h3 className="text-sm font-bold text-white mb-4 tracking-widest uppercase ml-1">Leaderboard Summary</h3>
           <div className="flex gap-4">
               <div className="flex-1 bg-black/20 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center">
                   <span className="text-[11px] text-gray-400 mb-1">Global Rank</span>
                   <div className="flex items-center gap-1.5">
                       <span className="text-lg font-bold text-white">#412</span>
                       <span className="flex items-center text-[10px] text-emerald-400 font-bold"><TrendingUp size={12} /> 12</span>
                   </div>
               </div>

               <div className="flex-1 bg-black/20 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center">
                   <span className="text-[11px] text-gray-400 mb-1">Regional Rank</span>
                   <div className="flex items-center gap-1.5">
                       <span className="text-lg font-bold text-white">#89</span>
                       <span className="flex items-center text-[10px] text-rose-400 font-bold"><TrendingDown size={12} /> 89</span>
                   </div>
               </div>
           </div>
       </div>

       {/* Show More Stats Button */}
       <button className="w-full py-4 rounded-xl text-white text-sm font-black uppercase tracking-wider border border-transparent hover:border-indigo-500/50 transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] relative overflow-hidden group">
           <div className="absolute inset-0 bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#1e1b4b] opacity-80 group-hover:opacity-100 transition-opacity" />
           <span className="relative z-10 flex items-center justify-center gap-2">
               MORE STATS <Target size={16} className="group-hover:text-indigo-400 transition-colors" />
           </span>
       </button>

    </div>
  );
}
