import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Rocket, Loader, Gift, Star, Share } from 'lucide-react';
import { api } from '../api/client';

export default function DailyTasks({ onBalanceUpdate, showToast }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(null);

  const [activeTab, setActiveTab] = useState('Daily Missions');
  const [subTab, setSubTab] = useState('Daily');

  useEffect(() => {
    fetchTasks();
  }, [subTab, activeTab]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.getDailyTasks();
      // Mock filtering based on UI tabs
      let filtered = data.tasks || [];
      if (subTab === 'Completed') {
          filtered = filtered.filter(t => t.claimed);
      } else {
          filtered = filtered.filter(t => !t.claimed);
      }
      setTasks(filtered);
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

  return (
    <div className="flex flex-col h-full bg-[#0a0f1c] text-white overflow-y-auto pb-24 px-4 pt-4 custom-scrollbar">
       {/* Top Navigation */}
       <div className="flex gap-4 border-b border-white/10 pb-2 mb-4">
          <button 
             className={`text-sm font-bold transition-colors ${activeTab === 'Daily Missions' ? 'text-white border-b-2 border-indigo-500 pb-2 -mb-[9px]' : 'text-gray-500'}`}
             onClick={() => setActiveTab('Daily Missions')}
          >
             Daily Missions
          </button>
          <button 
             className={`text-sm font-bold transition-colors ${activeTab === 'Ongoing Challenges' ? 'text-white border-b-2 border-indigo-500 pb-2 -mb-[9px]' : 'text-gray-500'}`}
             onClick={() => setActiveTab('Ongoing Challenges')}
          >
             Ongoing Challenges
          </button>
       </div>

       {/* Sub Navigation */}
       <div className="flex gap-2 mb-6">
          {['Daily', 'Weekly', 'Completed'].map(t => (
              <button 
                 key={t}
                 onClick={() => setSubTab(t)}
                 className={`px-4 py-1.5 rounded-xl text-xs font-semibold border ${subTab === t ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-transparent text-gray-500 border-transparent hover:bg-white/5'}`}
              >
                  {t}
              </button>
          ))}
       </div>

       {/* Tasks List */}
       <div className="flex flex-col gap-3">
          {loading ? (
             <div className="flex justify-center py-8">
                <Loader className="animate-spin text-indigo-500" size={24} />
             </div>
          ) : tasks.length === 0 ? (
             <div className="text-center text-gray-500 py-8 text-sm">Vazifalar yo'q</div>
          ) : (
             tasks.map((task, idx) => {
                 const progressPercent = Math.min(100, (task.progress / task.target_count) * 100);
                 const isCompleted = task.progress >= task.target_count;

                 return (
                     <motion.div 
                        key={task.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-[#0f172a] rounded-2xl p-4 border border-white/5 relative overflow-hidden"
                     >
                         {/* Subtle glowing background if completed */}
                         {isCompleted && !task.claimed && (
                             <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
                         )}

                         <div className="flex justify-between items-end mb-2 relative z-10">
                             <h3 className="font-bold text-sm text-white/90">{task.title}</h3>
                             <span className={`text-xs font-bold ${isCompleted ? 'text-emerald-400' : 'text-gray-400'}`}>
                                 {task.progress}/{task.target_count}
                             </span>
                         </div>

                         {/* Progress Bar */}
                         <div className="h-1.5 w-full bg-[#1e293b] rounded-full overflow-hidden mb-4 relative z-10">
                             <motion.div 
                                className={`h-full rounded-full ${isCompleted ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                             />
                         </div>

                         {/* Rewards & Actions */}
                         <div className="flex justify-between items-center relative z-10">
                             <div className="flex items-center gap-3">
                                 <div className="flex items-center gap-1">
                                     <Rocket size={14} className="text-indigo-400" />
                                     <span className="text-xs font-bold text-gray-200">+{task.rocket_reward} Rockets</span>
                                 </div>
                                 {idx % 2 === 1 && (
                                     <div className="flex items-center gap-1">
                                         <Star size={14} className="text-amber-400 fill-amber-400" />
                                         <span className="text-xs font-bold text-gray-200">+5</span>
                                     </div>
                                 )}
                             </div>

                             {task.claimed ? (
                                 <button className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-gray-500 border border-white/10" disabled>
                                     Olingan
                                 </button>
                             ) : isCompleted ? (
                                 <button 
                                     onClick={() => handleClaim(task.id)}
                                     disabled={claiming === task.id}
                                     className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all active:scale-95"
                                 >
                                     {claiming === task.id ? <Loader size={12} className="animate-spin" /> : <Gift size={12} />}
                                     Claim ✓
                                 </button>
                             ) : (
                                 <button className="px-5 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-95 shadow-lg bg-gradient-to-r from-indigo-500 to-purple-500">
                                     {idx === 2 ? 'Play' : 'Go'}
                                 </button>
                             )}
                         </div>
                     </motion.div>
                 );
             })
          )}

          {/* Hardcoded Custom Task Example matching the screenshot */}
          {!loading && subTab !== 'Completed' && (
              <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="bg-[#0f172a] rounded-2xl p-4 border border-white/5 relative overflow-hidden"
              >
                  <div className="flex justify-between items-center mb-1">
                      <h3 className="font-bold text-sm text-white/90">Reach Rank #100 Global</h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-bold border border-amber-500/30">New</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-4 text-center">Current Rank #412</p>

                  <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500">Rewards</span>
                          <span className="text-xs font-bold text-gray-200">Exclusive VIP Badge</span>
                      </div>
                      <button className="px-6 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95 shadow-lg bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-1">
                          Share
                      </button>
                  </div>
              </motion.div>
          )}

       </div>
    </div>
  );
}
