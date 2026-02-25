import { motion } from 'framer-motion';

export default function SplashScreen() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050A18] overflow-hidden">
            {/* Fullscreen Image */}
            <motion.img 
                src="/splash.png" 
                alt="Rocket Battle Splash"
                className="absolute inset-0 w-full h-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            />
        </div>
    );
}
