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
    <div className="flex flex-col h-full bg-[#0a0f1c] text-white overflow-y-auto pb-24 px-4 pt-6 custom-scrollbar">
       
       {/* Header */}
       <div className="flex justify-between items-center mb-6">
           <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-purple-500/30 p-0.5 bg-[#0f172a]">
                   <div className="w-full h-full rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-lg font-bold">
                       {username?.charAt(0).toUpperCase() || 'P'}
                   </div>
               </div>
               <div className="flex flex-col">
                   <h2 className="text-white font-bold text-base leading-tight">{username || 'Username'}</h2>
                   <span className="text-gray-400 text-xs">@{(username || 'GamerPro').toLowerCase().replace(' ', '')}</span>
               </div>
           </div>
           
           <div className="flex items-center gap-4 text-gray-400">
               <Bell size={20} className="hover:text-white transition-colors cursor-pointer" />
               <Settings size={20} className="hover:text-white transition-colors cursor-pointer" />
           </div>
       </div>

       {/* Rocket Balance Card */}
       <motion.div 
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         className="w-full rounded-2xl p-4 mb-4 relative overflow-hidden bg-[#1e2336] border border-white/5"
       >
           {/* Subtle gradient glow */}
           <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-2xl rounded-full translate-x-10 -translate-y-10" />

           <div className="flex justify-between items-start mb-2 relative z-10">
               <h3 className="text-gray-300 text-sm font-medium">Rocket Balance Card</h3>
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
       <button className="w-full py-3 mb-6 rounded-xl bg-[#1e2336] text-white/90 text-sm font-bold border border-white/5 hover:bg-white/5 transition-colors active:scale-[0.98]">
           Edit Profile
       </button>

       {/* Comprehensive Stats Grid */}
       <div className="bg-[#1e2336] rounded-2xl p-4 border border-white/5 mb-6">
           <div className="grid grid-cols-2 gap-y-6 gap-x-4">
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
       <div className="bg-[#1e2336] rounded-2xl p-4 border border-white/5 mb-6">
           <h3 className="text-sm font-bold text-white mb-4">Leaderboard Summary</h3>
           <div className="flex gap-3">
               <div className="flex-1 bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col items-center justify-center">
                   <span className="text-[11px] text-gray-400 mb-1">Global Rank</span>
                   <div className="flex items-center gap-1.5">
                       <span className="text-lg font-bold text-white">#412</span>
                       <span className="flex items-center text-[10px] text-emerald-400 font-bold"><TrendingUp size={12} /> 12</span>
                   </div>
               </div>

               <div className="flex-1 bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col items-center justify-center">
                   <span className="text-[11px] text-gray-400 mb-1">Regional Rank</span>
                   <div className="flex items-center gap-1.5">
                       <span className="text-lg font-bold text-white">#89</span>
                       <span className="flex items-center text-[10px] text-rose-400 font-bold"><TrendingDown size={12} /> 89</span>
                   </div>
               </div>
           </div>
       </div>

       {/* Show More Stats Button */}
       <button className="w-full py-4 rounded-xl bg-[#1e2336] text-white/90 text-sm font-bold border border-white/5 hover:bg-white/5 transition-colors active:scale-[0.98]">
           Show More Stats
       </button>

    </div>
  );
}
