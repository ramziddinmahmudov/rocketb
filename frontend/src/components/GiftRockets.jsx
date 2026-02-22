/**
 * GiftRockets — Send rockets to friends.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { api } from '../api/client';

export default function GiftRockets({ isOpen, onClose, balance, onBalanceUpdate, showToast }) {
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [giftLimit, setGiftLimit] = useState(null);

  const handleCheckLimit = async () => {
    if (!receiverId) return;
    try {
      const { data } = await api.getGiftLimit(parseInt(receiverId));
      setGiftLimit(data);
    } catch (err) {
      console.error('Failed to check limit:', err);
    }
  };

  const handleSend = async () => {
    if (!receiverId || !amount) return;
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast?.('❌ Noto\'g\'ri miqdor', 'error');
      return;
    }

    setSending(true);
    try {
      const { data } = await api.sendGift(parseInt(receiverId), amountNum);
      showToast?.(`🎁 ${amountNum} ta raketa yuborildi!`, 'success');
      onBalanceUpdate?.(data.sender_balance);
      setAmount('');
      setReceiverId('');
      setGiftLimit(null);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Xatolik yuz berdi';
      showToast?.(`❌ ${msg}`, 'error');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const presets = [10, 50, 100];

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="gift-modal"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="gift-header">
            <h2 className="gift-title">🎁 Raketa yuborish</h2>
            <button className="gift-close" onClick={onClose}>✕</button>
          </div>

          <div className="gift-content">
            {/* Balance display */}
            <div className="gift-balance">
              Balansingiz: <strong>{balance?.toLocaleString() || 0} 🚀</strong>
            </div>

            {/* Receiver ID input */}
            <div className="gift-field">
              <label>Do'stingiz ID si (Telegram)</label>
              <div className="gift-input-row">
                <input
                  type="number"
                  placeholder="Masalan: 1234567890"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  className="gift-input"
                />
                <button className="gift-check-btn" onClick={handleCheckLimit}>
                  Tekshirish
                </button>
              </div>
            </div>

            {/* Gift limit info */}
            {giftLimit && (
              <motion.div
                className="gift-limit-info"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <span>Bugun qolgan limit: <strong>{giftLimit.remaining_limit} 🚀</strong></span>
                {giftLimit.is_vip && <span className="vip-badge">👑 VIP</span>}
              </motion.div>
            )}

            {/* Amount input */}
            <div className="gift-field">
              <label>Miqdor</label>
              <input
                type="number"
                placeholder="Nechta raketa?"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="gift-input"
                min={1}
                max={balance || 0}
              />
            </div>

            {/* Quick presets */}
            <div className="gift-presets">
              {presets.map((preset) => (
                <button
                  key={preset}
                  className={`gift-preset ${amount == preset ? 'active' : ''}`}
                  onClick={() => setAmount(String(preset))}
                >
                  {preset} 🚀
                </button>
              ))}
            </div>

            {/* Send button */}
            <motion.button
              className="gift-send-btn"
              onClick={handleSend}
              disabled={sending || !receiverId || !amount}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {sending ? '⏳ Yuborilmoqda...' : '🚀 Yuborish'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
