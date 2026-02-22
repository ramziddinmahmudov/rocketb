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
import { api } from '../api/client';

export default function RoomBrowser({
  rooms,
  onJoinRoom,
  onCreateRoom,
  onDeleteRoom,
  onRefresh,
  isLoading,
  myUserId,
  showToast,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newRoomName.trim()) {
      showToast('Xona nomini kiriting', 'error');
      return;
    }
    setIsCreating(true);
    try {
      await onCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setShowCreateModal(false);
    } catch (err) {
      // parent handles error
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = (inviteCode) => {
    const botUsername = 'rocketbattleebot'; // TODO: from env
    const link = `https://t.me/RocketBattle_bot?start=room_${inviteCode}`;
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
        <h2 className="rb-title">🏟️ Battle Xonalari</h2>
        <p className="rb-subtitle">Xona tanlang yoki yangi yarating</p>
      </div>

      {/* Create Room Button */}
      <button
        className="rb-create-btn"
        onClick={() => setShowCreateModal(true)}
      >
        <span>➕</span>
        <span>Yangi xona yaratish</span>
      </button>

      {/* Room List */}
      <div className="rb-list">
        {isLoading && rooms.length === 0 ? (
          <div className="rb-empty">
            <span className="rb-empty-icon">⏳</span>
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
                    👥 {room.player_count || 0}/{room.max_players || 16}
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
                  Kirish ➜
                </button>
                <button
                  className="rb-share-btn"
                  onClick={() => handleCopyLink(room.invite_code)}
                  title="Havolani nusxalash"
                >
                  🔗
                </button>
                {room.creator_id === myUserId && (
                  <button
                    className="rb-delete-btn"
                    onClick={() => onDeleteRoom(room.id)}
                    title="Xonani o'chirish"
                  >
                    🗑️
                  </button>
                )}
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
        {isLoading ? '⏳ Yangilanmoqda...' : '🔄 Yangilash'}
      </button>

      {/* ── Create Room Modal ──────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <>
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
            />
            <motion.div
              className="rb-create-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <h3 className="rb-modal-title">🏟️ Yangi xona</h3>
              <input
                type="text"
                className="rb-modal-input"
                placeholder="Xona nomi..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                maxLength={50}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="rb-modal-actions">
                <button
                  className="rb-modal-cancel"
                  onClick={() => setShowCreateModal(false)}
                >
                  Bekor qilish
                </button>
                <button
                  className="rb-modal-confirm"
                  onClick={handleCreate}
                  disabled={isCreating || !newRoomName.trim()}
                >
                  {isCreating ? '⏳' : 'Yaratish ✨'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
