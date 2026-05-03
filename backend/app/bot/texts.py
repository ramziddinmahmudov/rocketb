"""All bot-facing text. Uzbek, fantasy/rocket battle theme. HTML parse mode."""
from .config import REFERRAL_BONUS, DAILY_BONUS, SUPPORT_CONTACT


def welcome(user: dict, daily_bonus: bool = False, ref_granted: bool = False) -> str:
    name = user.get("first_name") or "Sarkarda"
    parts = [
        f"⚔️  <b>Rocket Battle</b>'ga xush kelibsiz, {name}!",
        "",
        "🚀 Real vaqtda jang. Strategiya. Tezlik. G'alaba.",
        "",
        "📜 <b>Sizning maqsadingiz</b>:",
        "  ▸ Raqibga raketa otib balansini ko'taring",
        "  ▸ Top o'yinchilar safiga qo'shiling",
        "  ▸ Do'stlarni taklif qilib bonus oling",
    ]
    if daily_bonus:
        parts += ["", f"🎁 Kunlik kirish bonusi: <b>+{DAILY_BONUS} 🚀</b>"]
    if ref_granted:
        parts += ["", "🎉 Taklif qabul qilindi! Do'stingiz bonus oldi."]
    parts += [
        "",
        f"💰 Hozirgi balansingiz: <b>{user.get('rockets_balance', 0)} 🚀</b>",
        "",
        "Pastdagi tugmalardan birini tanlang yoki <code>/menu</code> yozing.",
    ]
    return "\n".join(parts)


def help_text() -> str:
    contact = f"\n\n📞 Yordam uchun: {SUPPORT_CONTACT}" if SUPPORT_CONTACT else ""
    return (
        "📖 <b>Yordam — Buyruqlar</b>\n\n"
        "🎮 <b>O'yin</b>\n"
        "<code>/menu</code> — Bosh menyu\n"
        "<code>/profile</code> — Statistikangiz va daraja\n"
        "<code>/top</code> — Top 10 o'yinchilar\n\n"
        "🛒 <b>Magazin va do'stlar</b>\n"
        "<code>/shop</code> — Telegram Stars orqali raketa olish\n"
        "<code>/invite</code> — Do'st taklif qilish (har biri uchun "
        f"+{REFERRAL_BONUS} 🚀)\n\n"
        "ℹ️ <b>Boshqalar</b>\n"
        "<code>/help</code> — Shu sahifa\n"
        f"{contact}"
    )


def menu_text() -> str:
    return "🏠 <b>Bosh menyu</b>\n\nQuyidagi bo'limlardan birini tanlang:"


def profile_text(u: dict, place: int | None = None, total_users: int | None = None) -> str:
    name = u.get("first_name") or "Sarkarda"
    next_xp = max(1, u["level"] * 100)
    pct = min(100, int((u["xp"] / next_xp) * 100)) if next_xp else 0
    bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
    win_rate = (u["wins"] / u["total_played"] * 100) if u["total_played"] else 0
    place_line = ""
    if place is not None and total_users is not None:
        place_line = f"\n🏅 Reyting: <b>#{place}</b> / {total_users}"
    return (
        f"👤 <b>{name}</b>"
        f"\n🆔 <code>{u['id']}</code>"
        f"{place_line}"
        f"\n\n💰 Balans: <b>{u['rockets_balance']} 🚀</b>"
        f"\n🪙 Tangalar: <b>{u['coins']}</b>"
        f"\n\n⭐ Daraja: <b>{u['level']}</b>"
        f"\n✨ XP: <b>{u['xp']}</b> / {next_xp}"
        f"\n<code>{bar}</code> {pct}%"
        f"\n\n⚔️ O'yinlar: <b>{u['total_played']}</b>"
        f"\n🏆 G'alabalar: <b>{u['wins']}</b> ({win_rate:.0f}%)"
        f"\n👥 Takliflar: <b>{u['referrals_count']}</b>"
    )


def shop_text(balance: int) -> str:
    return (
        "🛒 <b>Raketa Magazini</b>\n\n"
        f"💰 Hozirgi balans: <b>{balance} 🚀</b>\n\n"
        "🌟 Telegram Stars orqali raketa oling — jangda ustunlik qo'lga kiriting!\n\n"
        "Quyidagi paketlardan birini tanlang:"
    )


def shop_invoice_caption(amount: int, stars: int) -> str:
    return (
        f"🚀 <b>{amount} ta Raketa</b>\n\n"
        f"To'lov: <b>{stars} ⭐</b>\n"
        f"To'lovni tasdiqlagandan so'ng raketalar darhol balansingizga qo'shiladi."
    )


def payment_success_text(amount: int, stars: int, new_balance: int | None) -> str:
    bal = f"\n\n💰 Yangi balans: <b>{new_balance} 🚀</b>" if new_balance is not None else ""
    return (
        f"✅ <b>To'lov muvaffaqiyatli!</b>\n\n"
        f"Sizga <b>{amount} 🚀</b> qo'shildi (<b>{stars} ⭐</b> uchun).{bal}\n\n"
        f"Endi jangga kiring va g'alaba qiling! ⚔️"
    )


def leaderboard_text(top: list[dict], me_id: int | None = None) -> str:
    if not top:
        return "🏆 Hozircha hech kim ro'yxatda yo'q."
    medals = ["🥇", "🥈", "🥉"]
    lines = ["🏆 <b>Top 10 Sarkardalar</b>", ""]
    for i, u in enumerate(top, 1):
        prefix = medals[i - 1] if i <= 3 else f"  <b>{i}.</b>"
        you = " ← <b>siz</b>" if me_id and u["id"] == me_id else ""
        name = (u.get("first_name") or "Player")[:20]
        lines.append(
            f"{prefix} <b>{name}</b> — Lvl {u['level']} · {u['wins']} 🏆{you}"
        )
    return "\n".join(lines)


def invite_text(link: str, count: int) -> str:
    return (
        "👥 <b>Do'stlarni taklif qiling</b>\n\n"
        f"Har bir taklif uchun <b>+{REFERRAL_BONUS} 🚀</b> oling!\n\n"
        f"📊 Joriy takliflar: <b>{count}</b>\n\n"
        "🔗 <b>Sizning havolangiz</b>:\n"
        f"<code>{link}</code>\n\n"
        "Pastdagi tugma orqali ulashing."
    )


def support_battle_text() -> str:
    return (
        "🚨 <b>Do'stingizga jangda yordam kerak!</b>\n\n"
        "U yutqazyapti — siz unga raketa otib qo'llab-quvvatlay olasiz.\n"
        "Quyidagi tugmadan o'yinni oching va yordamga keling! ⚔️"
    )


# ----- Admin texts ----------------------------------------------------------


def admin_dashboard(stats: dict) -> str:
    return (
        "👑 <b>Admin Panel</b>\n\n"
        f"👥 Jami foydalanuvchilar: <b>{stats['total_users']}</b>\n"
        f"🟢 Bugun faol: <b>{stats['active_today']}</b>\n"
        f"⚔️ Jami janglar: <b>{stats['total_matches']}</b>\n"
        f"🚀 Aylanmadagi raketalar: <b>{stats['rockets_in_circulation']:,}</b>\n"
        f"💥 Sarflangan raketalar: <b>{stats['rockets_used']:,}</b>"
    )


def admin_user_card(u: dict) -> str:
    badge = "👑 ADMIN" if u.get("is_admin") else "👤 User"
    uname = f"@{u['username']}" if u.get("username") else "—"
    return (
        f"{badge}\n\n"
        f"<b>{u['first_name']}</b>\n"
        f"🆔 <code>{u['id']}</code>\n"
        f"🔗 {uname}\n\n"
        f"💰 Raketa: <b>{u['rockets_balance']}</b>\n"
        f"🪙 Tanga: <b>{u['coins']}</b>\n"
        f"⭐ Daraja: <b>{u['level']}</b> · ✨ XP: {u['xp']}\n"
        f"⚔️ O'yin: {u['total_played']} · 🏆 {u['wins']}\n"
        f"👥 Takliflar: {u['referrals_count']}"
    )


def admin_help() -> str:
    return (
        "👑 <b>Admin buyruqlari</b>\n\n"
        "<code>/admin</code> — Dashboard\n"
        "<code>/find &lt;id|@username&gt;</code> — Foydalanuvchi qidirish\n"
        "<code>/give &lt;id&gt; &lt;amount&gt;</code> — Raketa berish (manfiy ham OK)\n"
        "<code>/setlevel &lt;id&gt; &lt;level&gt;</code> — Daraja belgilash\n"
        "<code>/makeadmin &lt;id&gt;</code> — Admin huquqini toggle qilish\n"
        "<code>/broadcast &lt;text&gt;</code> — Hammaga xabar yuborish\n"
        "<code>/tasks</code> — Vazifalar ro'yxati\n"
        "<code>/addtask</code> — Yangi vazifa qo'shish (interaktiv)\n"
        "<code>/deltask &lt;id&gt;</code> — Vazifani o'chirish\n"
    )


def task_list_text(tasks: list[dict]) -> str:
    if not tasks:
        return "📋 Hozircha vazifalar yo'q.\n\n<code>/addtask</code> — yangi qo'shish"
    lines = ["📋 <b>Vazifalar ro'yxati</b>", ""]
    for t in tasks:
        chan = f" → {t['channel_url']}" if t.get("channel_url") else ""
        lines.append(
            f"<b>#{t['id']}</b> {t['title']}\n"
            f"   🎁 {t['reward']} 🚀 · {t['task_type']} (target: {t['target_count']}){chan}"
        )
    return "\n".join(lines)


def broadcast_preview(text: str, total: int) -> str:
    return (
        "📤 <b>Broadcast oldindan ko'rish</b>\n\n"
        f"<i>Quyidagi xabar <b>{total}</b> ta foydalanuvchiga yuboriladi:</i>\n\n"
        "─────────\n"
        f"{text}\n"
        "─────────"
    )


def broadcast_done(sent: int, failed: int) -> str:
    return (
        f"✅ Broadcast tugadi.\n\n"
        f"📤 Yuborildi: <b>{sent}</b>\n"
        f"❌ Xatolik: <b>{failed}</b>"
    )
