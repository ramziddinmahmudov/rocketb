/**
 * DailyTasks — Daily task panel with progress and claim buttons.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function DailyTasks({ isOpen, onClose, onBalanceUpdate, showToast }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(null);

  useEffect(() => {
    if (isOpen) fetchTasks();
  }, [isOpen]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.getDailyTasks();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (taskId) => {
    setClaiming(taskId);
    try {
      const { data } = await api.claimTask(taskId);
      showToast?.(`🎁 +${data.rockets_earned} raketa olindi!`, 'success');
      onBalanceUpdate?.(data.new_balance);
      fetchTasks(); // Refresh
    } catch (err) {
      const msg = err.response?.data?.detail || 'Xatolik yuz berdi';
      showToast?.(`❌ ${msg}`, 'error');
    } finally {
      setClaiming(null);
    }
  };

  if (!isOpen) return null;

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
          className="daily-tasks-modal"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="dt-header">
            <h2 className="dt-title">📋 Kunlik vazifalar</h2>
            <button className="dt-close" onClick={onClose}>✕</button>
          </div>

          {/* Tasks List */}
          <div className="dt-list">
            {loading ? (
              <div className="dt-loading">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >⏳</motion.span>
                Yuklanmoqda...
              </div>
            ) : tasks.length === 0 ? (
              <div className="dt-empty">Vazifalar yo'q</div>
            ) : (
              tasks.map((task, idx) => (
                <motion.div
                  key={task.id}
                  className={`dt-card ${task.completed ? 'completed' : ''} ${task.claimed ? 'claimed' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <div className="dt-card-content">
                    <div className="dt-card-header">
                      <h3 className="dt-card-title">{task.title}</h3>
                      <span className="dt-reward">+{task.rocket_reward} 🚀</span>
                    </div>
                    <p className="dt-card-desc">{task.description}</p>

                    {/* Progress bar */}
                    <div className="dt-progress-container">
                      <div className="dt-progress-bar">
                        <motion.div
                          className="dt-progress-fill"
                          animate={{
                            width: `${Math.min(100, (task.progress / task.target_count) * 100)}%`,
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="dt-progress-text">
                        {task.progress}/{task.target_count}
                      </span>
                    </div>

                    {/* Claim Button */}
                    {task.completed && !task.claimed && (
                      <motion.button
                        className="dt-claim-btn"
                        onClick={() => handleClaim(task.id)}
                        disabled={claiming === task.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {claiming === task.id ? '⏳' : '🎁 Olish'}
                      </motion.button>
                    )}

                    {task.claimed && (
                      <span className="dt-claimed-badge">✅ Olingan</span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
