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
import { RefreshCw, Loader, Crown, Clock } from 'lucide-react';
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



  return (
    <div className="flex flex-col gap-6" style={{ boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="text-center mt-2 mb-4">
         <h2 className="text-lg font-bold text-white/90">Xonalar Sahifasi</h2>
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
          rooms.map((room, index) => {
             return (
              <motion.div
                key={room.id || index}
                className="bg-gradient-to-br from-[#1e1b4b]/60 via-[#0f172a]/90 to-[#0f172a] backdrop-blur-md border border-indigo-500/20 rounded-3xl flex flex-col gap-5 shadow-[0_8px_30px_-10px_rgba(99,102,241,0.2)] relative overflow-hidden group hover:border-indigo-400/50 transition-colors"
                style={{ padding: '20px', boxSizing: 'border-box' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Subtle Hover Glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-purple-500/5 to-fuchsia-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                {/* Top Row: Name */}
                <div className="flex justify-between items-center mb-1 relative z-10">
                   <h3 className="font-black text-white text-xl drop-shadow-md tracking-tight">{room.name || '#RB-' + (201 + index)}</h3>
                </div>

                {/* Middle Row: Stats Grid */}
                <div className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-2xl border border-white/5 relative z-10">
                   <div className="flex flex-col gap-1 items-center justify-center">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Players</span>
                      <span className="text-sm font-black text-indigo-200 drop-shadow-sm">{room.player_count || 0}/{room.max_players || 16}</span>
                   </div>
                   <div className="flex flex-col gap-1 items-center justify-center border-l border-white/5">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Rounds</span>
                      <span className="text-sm font-black text-indigo-200 drop-shadow-sm">4 Stage</span>
                   </div>
                </div>

                {/* Bottom Row: Action */}
                <div className="flex w-full mt-2 relative z-10">
                   <button
                     className="w-full px-8 py-4 rounded-3xl text-[12px] font-black uppercase tracking-widest text-white transition-all active:scale-95 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 shadow-[0_4px_15px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.5)] border border-indigo-500/30"
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
        className="mt-6 mx-auto flex items-center gap-2 px-8 py-4 rounded-3xl bg-white/5 border border-white/10 text-gray-400 font-bold uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95 text-[12px]"
        onClick={onRefresh}
        disabled={isLoading}
      >
        {isLoading ? <><Loader size={16} className="animate-spin" /> Yangilanmoqda...</> : <><RefreshCw size={16} /> Yangilash</>}
      </button>

    </div>
  );
}
