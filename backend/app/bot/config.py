"""Bot configuration loaded from environment."""
import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
BOT_USERNAME = os.getenv("BOT_USERNAME", "").strip().lstrip("@")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://rocketbattle.duckdns.org").strip()
# Optional: Mini App short name registered in BotFather (e.g. "rocket"). When set,
# deep-link buttons use t.me/<bot>/<short_name>?startapp=… so start_param propagates
# natively into the Mini App.
MINI_APP_SHORT_NAME = os.getenv("MINI_APP_SHORT_NAME", "").strip()
SUPPORT_CONTACT = os.getenv("SUPPORT_CONTACT", "").strip()

_admin_raw = os.getenv("ADMIN_IDS", "")
ADMIN_IDS = {int(x.strip()) for x in _admin_raw.split(",") if x.strip().isdigit()}

# Stars price packages: rockets -> stars cost
STAR_PACKAGES = {
    10: 10,
    50: 45,
    100: 85,
    300: 240,
    500: 380,
    1000: 700,
    3000: 1900,
}

# Bonus rockets per successful referral
REFERRAL_BONUS = 50

# Daily login bonus (mirrors /api/auth/login behavior; bot grants only when user
# opens it from Telegram on a new day).
DAILY_BONUS = 10
