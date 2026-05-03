"""Admin commands and inline flows. Gated by AdminFilter."""
import asyncio
import logging

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import texts
from ..db import (
    add_task,
    credit_rockets,
    delete_task,
    find_user,
    get_all_user_ids,
    get_global_stats,
    get_user,
    list_tasks,
    set_level,
    toggle_admin,
)
from ..filters import AdminFilter
from ..keyboards import admin_menu, admin_user_actions, broadcast_confirm

logger = logging.getLogger(__name__)
router = Router(name="admin")
router.message.filter(AdminFilter())
router.callback_query.filter(AdminFilter())


class BroadcastFSM(StatesGroup):
    waiting_text = State()
    confirming = State()


class FindFSM(StatesGroup):
    waiting_query = State()


class AddTaskFSM(StatesGroup):
    title = State()
    reward = State()
    task_type = State()
    target_count = State()
    channel_url = State()


# ----- Dashboard ------------------------------------------------------------


@router.message(Command("admin"))
async def admin_cmd(message: Message):
    stats = await get_global_stats()
    await message.answer(texts.admin_dashboard(stats), reply_markup=admin_menu())


@router.callback_query(F.data == "adm:back")
async def cb_admin_back(query: CallbackQuery, state: FSMContext):
    await state.clear()
    stats = await get_global_stats()
    try:
        await query.message.edit_text(texts.admin_dashboard(stats), reply_markup=admin_menu())
    except Exception:
        await query.message.answer(texts.admin_dashboard(stats), reply_markup=admin_menu())
    await query.answer()


@router.callback_query(F.data == "adm:stats")
async def cb_stats(query: CallbackQuery):
    stats = await get_global_stats()
    await query.message.edit_text(texts.admin_dashboard(stats), reply_markup=admin_menu())
    await query.answer()


@router.callback_query(F.data == "adm:help")
async def cb_help(query: CallbackQuery):
    await query.message.edit_text(texts.admin_help(), reply_markup=admin_menu())
    await query.answer()


# ----- Find user ------------------------------------------------------------


@router.callback_query(F.data == "adm:find")
async def cb_find_start(query: CallbackQuery, state: FSMContext):
    await state.set_state(FindFSM.waiting_query)
    await query.message.answer(
        "🔍 Foydalanuvchi ID yoki @username yuboring.\n"
        "Bekor qilish: <code>/cancel</code>"
    )
    await query.answer()


@router.message(Command("find"))
async def find_cmd(message: Message, command: CommandObject):
    arg = (command.args or "").strip()
    if not arg:
        await message.answer("Foydalanish: <code>/find &lt;id|@username&gt;</code>")
        return
    await _do_find(message, arg)


@router.message(FindFSM.waiting_query, F.text)
async def find_input(message: Message, state: FSMContext):
    await state.clear()
    await _do_find(message, message.text.strip())


async def _do_find(message: Message, query: str):
    u = await find_user(query)
    if not u:
        await message.answer("❌ Topilmadi.")
        return
    await message.answer(
        texts.admin_user_card(u),
        reply_markup=admin_user_actions(u["id"], u["is_admin"]),
    )


# ----- Give rockets ---------------------------------------------------------


@router.message(Command("give"))
async def give_cmd(message: Message, command: CommandObject):
    parts = (command.args or "").split()
    if len(parts) != 2:
        await message.answer("Foydalanish: <code>/give &lt;user_id&gt; &lt;amount&gt;</code>")
        return
    try:
        target_id = int(parts[0])
        amount = int(parts[1])
    except ValueError:
        await message.answer("user_id va amount son bo'lishi kerak.")
        return
    new_balance = await credit_rockets(target_id, amount)
    if new_balance is None:
        await message.answer("❌ Foydalanuvchi topilmadi yoki balans yetarli emas.")
        return
    await message.answer(
        f"✅ <code>{target_id}</code>ga <b>{amount:+d}</b> 🚀 berildi.\n"
        f"💰 Yangi balans: <b>{new_balance}</b>"
    )


@router.callback_query(F.data.startswith("adm:give:"))
async def cb_quick_give(query: CallbackQuery):
    try:
        _, _, target_id_str, amount_str = query.data.split(":")
        target_id = int(target_id_str)
        amount = int(amount_str)
    except ValueError:
        await query.answer("Noto'g'ri ma'lumot", show_alert=True)
        return
    new_balance = await credit_rockets(target_id, amount)
    if new_balance is None:
        await query.answer("Xatolik", show_alert=True)
        return
    await query.answer(f"✅ +{amount} 🚀 → balans {new_balance}", show_alert=True)
    # Refresh the card
    u = await get_user(target_id)
    if u:
        try:
            await query.message.edit_text(
                texts.admin_user_card(u),
                reply_markup=admin_user_actions(u["id"], u["is_admin"]),
            )
        except Exception:
            pass


@router.callback_query(F.data.startswith("adm:toggle_admin:"))
async def cb_toggle_admin(query: CallbackQuery):
    try:
        target_id = int(query.data.split(":")[2])
    except (IndexError, ValueError):
        await query.answer("Noto'g'ri", show_alert=True)
        return
    new_state = await toggle_admin(target_id)
    if new_state is None:
        await query.answer("Topilmadi", show_alert=True)
        return
    await query.answer(
        ("👑 Admin huquqi berildi" if new_state else "⛔ Admin huquqi olindi"),
        show_alert=True,
    )
    u = await get_user(target_id)
    if u:
        try:
            await query.message.edit_text(
                texts.admin_user_card(u),
                reply_markup=admin_user_actions(u["id"], u["is_admin"]),
            )
        except Exception:
            pass


# ----- Set level ------------------------------------------------------------


@router.message(Command("setlevel"))
async def setlevel_cmd(message: Message, command: CommandObject):
    parts = (command.args or "").split()
    if len(parts) != 2:
        await message.answer("Foydalanish: <code>/setlevel &lt;user_id&gt; &lt;level&gt;</code>")
        return
    try:
        target_id, level = int(parts[0]), int(parts[1])
    except ValueError:
        await message.answer("Sonlar kiriting.")
        return
    ok = await set_level(target_id, level)
    if not ok:
        await message.answer("❌ Foydalanuvchi topilmadi.")
        return
    await message.answer(f"✅ <code>{target_id}</code> daraja: <b>{max(1, level)}</b>")


@router.message(Command("makeadmin"))
async def makeadmin_cmd(message: Message, command: CommandObject):
    arg = (command.args or "").strip()
    if not arg.lstrip("-").isdigit():
        await message.answer("Foydalanish: <code>/makeadmin &lt;user_id&gt;</code>")
        return
    target_id = int(arg)
    new_state = await toggle_admin(target_id)
    if new_state is None:
        await message.answer("❌ Foydalanuvchi topilmadi.")
        return
    await message.answer(
        ("👑 Admin huquqi berildi." if new_state else "⛔ Admin huquqi olindi.")
    )


# ----- Broadcast ------------------------------------------------------------


@router.callback_query(F.data == "adm:bcast")
async def cb_bcast_start(query: CallbackQuery, state: FSMContext):
    await state.set_state(BroadcastFSM.waiting_text)
    await query.message.answer(
        "📢 Yubormoqchi bo'lgan xabaringizni yozing.\n"
        "Bekor qilish: <code>/cancel</code>"
    )
    await query.answer()


@router.message(Command("broadcast"))
async def broadcast_cmd(message: Message, command: CommandObject, state: FSMContext):
    text = (command.args or "").strip()
    if not text and message.reply_to_message:
        text = message.reply_to_message.html_text or message.reply_to_message.text or ""
    if not text:
        await state.set_state(BroadcastFSM.waiting_text)
        await message.answer(
            "📢 Yubormoqchi bo'lgan xabaringizni yozing.\n"
            "Bekor qilish: <code>/cancel</code>"
        )
        return
    await _bcast_preview(message, state, text)


@router.message(BroadcastFSM.waiting_text, F.text)
async def bcast_text_input(message: Message, state: FSMContext):
    await _bcast_preview(message, state, message.html_text or message.text)


async def _bcast_preview(message: Message, state: FSMContext, text: str):
    user_ids = await get_all_user_ids()
    await state.set_state(BroadcastFSM.confirming)
    await state.update_data(text=text, user_ids=user_ids)
    await message.answer(
        texts.broadcast_preview(text, len(user_ids)),
        reply_markup=broadcast_confirm(),
    )


@router.callback_query(BroadcastFSM.confirming, F.data == "adm:bcast:cancel")
async def bcast_cancel(query: CallbackQuery, state: FSMContext):
    await state.clear()
    await query.message.edit_text("❌ Broadcast bekor qilindi.", reply_markup=admin_menu())
    await query.answer()


@router.callback_query(BroadcastFSM.confirming, F.data == "adm:bcast:send")
async def bcast_send(query: CallbackQuery, state: FSMContext, bot: Bot):
    data = await state.get_data()
    await state.clear()
    text = data.get("text") or ""
    user_ids = data.get("user_ids") or []
    if not text or not user_ids:
        await query.answer("Hech narsa yuborilmadi.", show_alert=True)
        return

    await query.message.edit_text(
        f"📤 Yuborilmoqda... ({len(user_ids)} foydalanuvchi)"
    )
    await query.answer()

    sent = failed = 0
    # Telegram allows ~30 msg/sec broadcast; 50ms sleep keeps us safe.
    for uid in user_ids:
        try:
            await bot.send_message(uid, text)
            sent += 1
        except Exception:
            failed += 1
        await asyncio.sleep(0.05)

    await query.message.answer(
        texts.broadcast_done(sent, failed),
        reply_markup=admin_menu(),
    )


# ----- Tasks ----------------------------------------------------------------


@router.message(Command("tasks"))
async def tasks_cmd(message: Message):
    tasks = await list_tasks()
    await message.answer(texts.task_list_text(tasks), reply_markup=admin_menu())


@router.callback_query(F.data == "adm:tasks")
async def cb_tasks(query: CallbackQuery):
    tasks = await list_tasks()
    await query.message.edit_text(texts.task_list_text(tasks), reply_markup=admin_menu())
    await query.answer()


@router.message(Command("deltask"))
async def deltask_cmd(message: Message, command: CommandObject):
    arg = (command.args or "").strip()
    if not arg.isdigit():
        await message.answer("Foydalanish: <code>/deltask &lt;task_id&gt;</code>")
        return
    ok = await delete_task(int(arg))
    await message.answer("✅ O'chirildi." if ok else "❌ Topilmadi.")


@router.message(Command("addtask"))
async def addtask_start(message: Message, state: FSMContext):
    await state.set_state(AddTaskFSM.title)
    await message.answer(
        "➕ <b>Yangi vazifa qo'shish</b>\n\n"
        "1/5 — Vazifa <b>nomini</b> yozing:\n"
        "Bekor qilish: <code>/cancel</code>"
    )


@router.message(AddTaskFSM.title, F.text)
async def addtask_title(message: Message, state: FSMContext):
    await state.update_data(title=message.text.strip()[:200])
    await state.set_state(AddTaskFSM.reward)
    await message.answer("2/5 — <b>Mukofot</b> (raketa soni, son):")


@router.message(AddTaskFSM.reward, F.text)
async def addtask_reward(message: Message, state: FSMContext):
    if not message.text.strip().isdigit():
        await message.answer("Iltimos, son kiriting.")
        return
    await state.update_data(reward=int(message.text.strip()))
    await state.set_state(AddTaskFSM.task_type)
    await message.answer(
        "3/5 — <b>Vazifa turi</b>:\n"
        "<code>use_rockets</code>, <code>join_channel</code>, "
        "<code>invite_friends</code> yoki <code>custom</code>"
    )


@router.message(AddTaskFSM.task_type, F.text)
async def addtask_type(message: Message, state: FSMContext):
    t = message.text.strip().lower()
    if t not in ("use_rockets", "join_channel", "invite_friends", "custom"):
        await message.answer("Yuqoridagi 4 ta turdan birini kiriting.")
        return
    await state.update_data(task_type=t)
    await state.set_state(AddTaskFSM.target_count)
    await message.answer("4/5 — <b>Maqsad soni</b> (masalan, 300 ta raketa, 1 ta kanal):")


@router.message(AddTaskFSM.target_count, F.text)
async def addtask_target(message: Message, state: FSMContext):
    if not message.text.strip().isdigit():
        await message.answer("Iltimos, son kiriting.")
        return
    await state.update_data(target_count=int(message.text.strip()))
    data = await state.get_data()
    if data.get("task_type") == "join_channel":
        await state.set_state(AddTaskFSM.channel_url)
        await message.answer("5/5 — <b>Kanal URL</b> va <b>chat_id</b> (format: <code>https://t.me/xxx | @xxx</code>):")
    else:
        await _addtask_save(message, state)


@router.message(AddTaskFSM.channel_url, F.text)
async def addtask_channel(message: Message, state: FSMContext):
    parts = [p.strip() for p in message.text.split("|")]
    url = parts[0] if parts else ""
    chat = parts[1] if len(parts) > 1 else None
    await state.update_data(channel_url=url, channel_id=chat)
    await _addtask_save(message, state)


async def _addtask_save(message: Message, state: FSMContext):
    data = await state.get_data()
    await state.clear()
    task_id = await add_task(
        title=data["title"],
        reward=data["reward"],
        task_type=data.get("task_type", "custom"),
        target_count=data.get("target_count", 1),
        channel_id=data.get("channel_id"),
        channel_url=data.get("channel_url"),
    )
    await message.answer(
        f"✅ Vazifa <b>#{task_id}</b> qo'shildi.\n\n<b>{data['title']}</b> · 🎁 {data['reward']} 🚀",
        reply_markup=admin_menu(),
    )


# ----- Cancel ---------------------------------------------------------------


@router.message(Command("cancel"))
async def cancel_cmd(message: Message, state: FSMContext):
    cur = await state.get_state()
    if cur is None:
        await message.answer("Bekor qiladigan amal yo'q.")
        return
    await state.clear()
    await message.answer("❌ Bekor qilindi.", reply_markup=admin_menu())
