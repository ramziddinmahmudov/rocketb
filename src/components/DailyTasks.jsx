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
       <div className="flex gap-2 p-1 bg-[#1e2336]/60 backdrop-blur-md rounded-2xl border border-white/5 mb-4 relative z-10 w-max shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
          <button 
             className={`px-5 py-2 text-sm font-bold transition-all rounded-xl relative ${activeTab === 'Daily Missions' ? 'text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
             onClick={() => setActiveTab('Daily Missions')}
          >
             {activeTab === 'Daily Missions' && (
                 <motion.div layoutId="navTab" className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl -z-10 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
             )}
             Daily Missions
          </button>
          <button 
             className={`px-5 py-2 text-sm font-bold transition-all rounded-xl relative ${activeTab === 'Ongoing Challenges' ? 'text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
             onClick={() => setActiveTab('Ongoing Challenges')}
          >
             {activeTab === 'Ongoing Challenges' && (
                 <motion.div layoutId="navTab" className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl -z-10 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
             )}
             Ongoing Challenges
          </button>
       </div>

       {/* Sub Navigation */}
       <div className="flex gap-2 mb-4">
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
                             <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
                         )}

                         <div className="flex justify-between items-end mb-2 relative z-10">
                             <h3 className="font-bold text-sm text-white/90 drop-shadow-md">{task.title}</h3>
                             <span className={`text-[10px] font-black uppercase tracking-widest ${isCompleted ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-gray-400'}`}>
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
                             <div className="flex items-center gap-3 bg-black/20 px-3 py-1.5 rounded-xl border border-white/5">
                                 <div className="flex items-center gap-1.5">
                                     <Rocket size={14} className="text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.8)]" />
                                     <span className="text-[11px] font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">+{task.rocket_reward} Rockets</span>
                                 </div>
                                 {idx % 2 === 1 && (
                                     <>
                                         <div className="w-[1px] h-3 bg-white/10" />
                                         <div className="flex items-center gap-1">
                                             <Star size={12} className="text-amber-400 fill-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" />
                                             <span className="text-[11px] font-black text-amber-300">+5</span>
                                         </div>
                                     </>
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
                                     className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-[0_0_15px_rgba(52,211,153,0.5)] hover:shadow-[0_0_25px_rgba(52,211,153,0.7)] transition-all active:scale-95"
                                 >
                                     {claiming === task.id ? <Loader size={14} className="animate-spin" /> : <Gift size={14} />}
                                     CLAIM
                                 </button>
                             ) : (
                                 <button className="px-5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase text-white hover:text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:shadow-[0_0_25px_rgba(168,85,247,0.6)] bg-gradient-to-r from-indigo-500 to-purple-500">
                                     {idx === 2 ? 'PLAY' : 'GO'}
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
