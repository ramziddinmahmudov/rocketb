/**
 * RoomBrowser — Main screen showing list of battle rooms.
 *
 * Users can:
 *   - See active rooms with player counts
 *   - Create a new room
 *   - Join a room
 *   - Delete their own rooms
 *   - Copy invite link to share
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { RefreshCw, Loader, Crown } from 'lucide-react';
import { api } from '../api/client';

export default function RoomBrowser({
  rooms,
  onJoinRoom,
  onCreateRoom, // This won't be called from UI anymore, but keeping prop for now backwards compatibility or remove it in parent
  onDeleteRoom,
  onRefresh,
  isLoading,
  myUserId,
  showToast,
  onJoinRandom,
}) {
  const handleCopyLink = (inviteCode) => {
    const botUsername = 'rocketbattleebot'; // TODO: from env
    const link = `https://t.me/rocketbattleebot?start=room_${inviteCode}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast('📋 Havola nusxalandi!', 'success');
    }).catch(() => {
      showToast('Nusxalab bo\'lmadi', 'error');
    });
  };

  const [activeTab, setActiveTab] = useState('All');
  const tabs = ['All', 'Free', 'VIP', 'High Stakes'];

  // Temporary mock logic for badges/cost based on room index until API supports it
  const filteredRooms = rooms.filter(r => {
      // Very basic filtering mock since backend might not send these yet
      if (activeTab === 'All') return true;
      if (activeTab === 'Free') return false; // mockup logic
      if (activeTab === 'VIP') return true;   // mockup logic
      if (activeTab === 'High Stakes') return false; // mockup logic
      return true;
  });

  return (
    <div className="px-5 pt-6 pb-28 flex flex-col gap-6 w-full h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="text-center mt-2 mb-4">
         <h2 className="text-lg font-bold text-white/90">Xonalar Sahifasi</h2>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-4">
         <div className="flex w-full gap-2 p-1 bg-[#1e2336]/80 backdrop-blur-md rounded-2xl border border-white/5 relative z-10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            {tabs.map(tab => (
               <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all rounded-xl relative ${
                     activeTab === tab ? 'text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                  }`}
               >
                  {activeTab === tab && (
                      <motion.div layoutId="roomTab" className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl -z-10 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                  )}
                  {tab}
               </button>
            ))}
         </div>
      </div>

      {/* Room List grid */}
      <div className="flex flex-col gap-6">
        {isLoading && rooms.length === 0 ? (
          <div className="rb-empty">
            <span className="rb-empty-icon"><Clock size={28} color="#a78bfa" /></span>
            <p>Yuklanmoqda...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="rb-empty">
            <span className="rb-empty-icon">🏜️</span>
            <p>Hozircha xona yo'q</p>
            <p className="rb-empty-sub">
              Birinchi bo'lib yarating!
            </p>
          </div>
        ) : (
          filteredRooms.map((room, index) => {
             // Mock data logic for mockup resemblance
             const isVip = index % 3 === 0;
             const isFree = index % 3 === 1;
             const isHighStakes = index % 3 === 2;
             
             return (
              <motion.div
                key={room.id || index}
                className="bg-gradient-to-br from-[#1e1b4b]/60 via-[#0f172a]/90 to-[#0f172a] backdrop-blur-md border border-indigo-500/20 rounded-3xl p-5 flex flex-col gap-5 shadow-[0_8px_30px_-10px_rgba(99,102,241,0.2)] relative overflow-hidden group hover:border-indigo-400/50 transition-colors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Subtle Hover Glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-purple-500/5 to-fuchsia-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                {/* Top Row: Name & Badge */}
                <div className="flex justify-between items-center mb-1 relative z-10">
                   <h3 className="font-black text-white text-xl drop-shadow-md tracking-tight">{room.name || '#RB-' + (201 + index)}</h3>
                   {isVip && <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-md flex items-center gap-1 shadow-[0_0_10px_rgba(251,191,36,0.2)]"><Crown size={12} className="drop-shadow-sm" /> VIP</span>}
                   {isFree && <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-md shadow-[0_0_10px_rgba(52,211,153,0.2)]">Free</span>}
                   {isHighStakes && <span className="text-[10px] font-black uppercase tracking-wider text-pink-500 bg-pink-500/10 border border-pink-500/30 px-2 py-1 rounded-md shadow-[0_0_10px_rgba(236,72,153,0.2)]">High Stakes</span>}
                </div>

                {/* Middle Row: Stats Grid */}
                <div className="grid grid-cols-3 gap-4 bg-black/30 p-4 rounded-2xl border border-white/5 relative z-10">
                   <div className="flex flex-col gap-1 items-center justify-center">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Players</span>
                      <span className="text-sm font-black text-indigo-200 drop-shadow-sm">{room.player_count || 0}/{room.max_players || 16}</span>
                   </div>
                   <div className="flex flex-col gap-1 items-center justify-center border-x border-white/5">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Rounds</span>
                      <span className="text-sm font-black text-indigo-200 drop-shadow-sm">4 Stage</span>
                   </div>
                   <div className="flex flex-col gap-1 items-center justify-center">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Entry Cost</span>
                      <span className="text-sm font-black text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">{isFree ? 'FREE' : '50🚀'}</span>
                   </div>
                </div>

                {/* Bottom Row: Countdown & Action */}
                <div className="flex justify-between items-end mt-1 relative z-10">
                   <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Countdown</span>
                      <span className="text-sm font-black text-fuchsia-400 drop-shadow-[0_0_8px_rgba(232,121,249,0.5)]">starts in 2m 15s</span>
                   </div>
                   <button
                     className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all active:scale-95 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]"
                     onClick={() => onJoinRoom(room.invite_code)}
                   >
                     ENTER ROOM
                   </button>
                </div>
              </motion.div>
             );
          })
        )}
      </div>

      <button
        className="mt-6 mx-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors text-sm"
        onClick={onRefresh}
        disabled={isLoading}
      >
        {isLoading ? <><Loader size={14} className="animate-spin" /> Yangilanmoqda...</> : <><RefreshCw size={14} /> Yangilash</>}
      </button>

    </div>
  );
}
