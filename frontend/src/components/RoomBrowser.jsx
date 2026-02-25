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
import { Swords, PlusCircle, Users, Link2, Trash2, RefreshCw, Sparkles, Loader, ArrowRight, Clock } from 'lucide-react';
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
    <div className="room-browser">
      {/* Header */}
      <div className="rb-header">
        <h2 className="rb-title"><Swords size={22} color="#a78bfa" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Battle Xonalari</h2>
        <p className="rb-subtitle">Xona tanlang yoki yangi yarating</p>
      </div>

      {/* Random Button */}
      <div className="flex flex-col gap-3 px-4 mb-4">
        {/* Random button removed as per request */}
      </div>

      {/* Room List */}
      <div className="rb-list">
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
          rooms.map((room, index) => (
            <motion.div
              key={room.id || index}
              className="rb-room-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="rb-room-info">
                <div className="rb-room-name-row">
                  <h3 className="rb-room-name">{room.name || 'Battle Room'}</h3>
                  {room.creator_id === myUserId && (
                    <span className="rb-owner-badge">Sizning</span>
                  )}
                </div>
                <div className="rb-room-meta">
                  <span className="rb-player-count">
                    <Users size={14} color="#38bdf8" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {room.player_count || 0}/{room.max_players || 16}
                  </span>
                  <span className="rb-room-code">
                    #{room.invite_code}
                  </span>
                </div>
                {/* Player count bar */}
                <div className="rb-player-bar">
                  <div
                    className="rb-player-bar-fill"
                    style={{
                      width: `${((room.player_count || 0) / (room.max_players || 16)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="rb-room-actions">
                <button
                  className="rb-join-btn"
                  onClick={() => onJoinRoom(room.invite_code)}
                >
                  Kirish <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                </button>
                <button
                  className="rb-share-btn"
                  onClick={() => handleCopyLink(room.invite_code)}
                  title="Havolani nusxalash"
                >
                  <Link2 size={16} color="#38bdf8" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Refresh */}
      <button
        className="rb-refresh-btn"
        onClick={onRefresh}
        disabled={isLoading}
      >
        {isLoading ? <><Loader size={14} className="spin-icon" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Yangilanmoqda...</> : <><RefreshCw size={14} color="#34d399" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Yangilash</>}
      </button>

    </div>
  );
}
