import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export default function StoreModal({ isOpen, onClose, api, showToast, isVip }) {
  const [isLoading, setIsLoading] = useState(false);

  const packages = [
    { stars: 10, rockets: 10, label: 'Starter' },
    { stars: 100, rockets: 100, label: 'Captain' },
    { stars: 500, rockets: 550, label: 'Admiral', bonus: '+10%' },
    { stars: 1000, rockets: 1150, label: 'Galactic', bonus: '+15%' },
  ];

  const handlePurchase = async (type, stars) => {
    setIsLoading(true);
    try {
        console.log('[DEBUG] Creating invoice:', { type, items: stars });
        // 1. Get invoice link from backend
        const res = await api.createInvoice(type, stars);
        console.log('[DEBUG] Invoice response:', res.data);
        const { invoice_link } = res.data;

        // 2. Open Telegram Invoice
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.openInvoice(invoice_link, (status) => {
                if (status === 'paid') {
                    showToast('Payment successful! Rockets incoming 🚀', 'success');
                    onClose();
                    setTimeout(() => window.location.reload(), 1500); 
                } else if (status === 'cancelled') {
                    showToast('Payment cancelled', 'info');
                } else if (status === 'failed') {
                    showToast('Payment failed', 'error');
                }
            });
        } else {
             window.open(invoice_link, '_blank');
        }
    } catch (err) {
        console.error("[DEBUG] Purchase failed:", err);
        const status = err.response?.status || 'N/A';
        const detail = err.response?.data?.detail || err.message || 'Unknown error';
        const debugMsg = `[${status}] ${detail}`;
        console.error('[DEBUG] Error detail:', debugMsg);
        showToast(`❌ ${debugMsg}`, 'error');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-x-4 bottom-4 top-20 z-50 flex flex-col pointer-events-none"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-y-auto pointer-events-auto h-full flex flex-col relative max-w-md mx-auto w-full">
              
              {/* Close Button */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-2"
              >
                ✕
              </button>

              <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    ROCKET STORE
                </h2>
                <p className="text-sm text-gray-400">Top up your arsenal via Telegram Stars</p>
              </div>

              {/* VIP Offer */}
              {!isVip && (
                  <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-amber-500 text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                        BEST VALUE
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-4xl">👑</div>
                        <div>
                            <h3 className="font-bold text-amber-300">VIP Status</h3>
                            <p className="text-xs text-amber-200/70">max 300 votes • 1h cooldown</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handlePurchase('vip')}
                        disabled={isLoading}
                        className="w-full mt-3 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-xl font-bold text-black shadow-lg hover:brightness-110 active:scale-95 transition-all text-sm"
                    >
                        {isLoading ? 'Processing...' : 'Upgrade for 1000 ⭐'}
                    </button>
                  </div>
              )}

              {/* Rocket Packages */}
              <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {packages.map((pkg) => (
                    <div key={pkg.stars} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
                                🚀
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white">{pkg.rockets} Rockets</span>
                                    {pkg.bonus && <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 rounded-md font-bold">{pkg.bonus}</span>}
                                </div>
                                <span className="text-xs text-gray-500">{pkg.label} Package</span>
                            </div>
                        </div>
                        <button
                            onClick={() => handlePurchase('rocket', pkg.stars)}
                            disabled={isLoading}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-semibold text-sm transition-colors flex items-center gap-1"
                        >
                            <span>{pkg.stars}</span> <span className="text-yellow-400">⭐</span>
                        </button>
                    </div>
                ))}
              </div>

              <div className="mt-6 text-center text-xs text-gray-600">
                Payments processed securely by Telegram
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
