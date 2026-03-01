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
    <div className="room-browser flex flex-col h-full overflow-y-auto pb-24 px-4 pt-2 custom-scrollbar">
      {/* Header */}
      <div className="text-center mt-2 mb-4">
         <h2 className="text-lg font-bold text-white/90">Xonalar Sahifasi</h2>
      </div>

      {/* Tabs */}
      <div className="flex justify-between gap-2 mb-6 bg-white/5 p-1 rounded-xl">
         {tabs.map(tab => (
            <button
               key={tab}
               onClick={() => setActiveTab(tab)}
               className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab 
                     ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg' 
                     : 'text-gray-400 hover:text-gray-300'
               }`}
            >
               {tab}
            </button>
         ))}
      </div>

      {/* Room List grid */}
      <div className="flex flex-col gap-4">
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
                className="bg-[#0f172a] border border-white/10 rounded-2xl p-4 flex flex-col gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Top Row: Name & Badge */}
                <div className="flex justify-between items-center">
                   <h3 className="font-bold text-white text-lg">{room.name || '#RB-' + (201 + index)}</h3>
                   {isVip && <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1"><Crown size={10} /> VIP</span>}
                   {isFree && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">Free</span>}
                   {isHighStakes && <span className="text-[10px] font-bold text-pink-500 bg-pink-500/10 border border-pink-500/30 px-2 py-0.5 rounded">High Stakes</span>}
                </div>

                {/* Middle Row: Stats Grid */}
                <div className="grid grid-cols-3 gap-2">
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Players</span>
                      <span className="text-sm font-semibold text-white/90">{room.player_count || 0}/{room.max_players || 16}</span>
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Players</span>
                      <span className="text-sm font-semibold text-white/90">{room.player_count || 0}/{room.max_players || 16}</span>
                   </div>
                   <div className="flex flex-col gap-1 text-right">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Entry Cost</span>
                      <span className="text-sm font-semibold text-white/90">{isFree ? 'Free' : '50 Rockets'}</span>
                   </div>
                </div>

                {/* Bottom Row: Countdown & Action */}
                <div className="flex justify-between items-end mt-2">
                   <div className="flex flex-col">
                      <span className="text-[11px] text-gray-500">Countdown</span>
                      <span className="text-xs font-semibold text-gray-300">starts in 2m 15s</span>
                   </div>
                   <button
                     className="px-6 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                     style={{ background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }}
                     onClick={() => onJoinRoom(room.invite_code)}
                   >
                     Join
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
