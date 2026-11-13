import telebot
from telebot import types

# Siz yuborgan token
TOKEN = "9241880191:AAHfYqQSQC9KOpeAfFdomyft9nhIBm-h6sk"
bot = telebot.TeleBot(TOKEN)

# Xodimlar keldim/ketdim deb rasm yuborganda ishlaydigan qism
@bot.message_handler(content_types=['photo'])
def handle_davomat_photo(message):
    user_id = message.from_user.id
    user_name = message.from_user.full_name
    caption = message.caption or "Izoh yo'q"
    
    # Rasmni olish
    file_id = message.photo[-1].file_id
    
    # Adminga yoki guruhga xodimning rasmi va vaqtini yuborish
    # (message.chat.id o'rniga kerakli guruh ID raqamini yozishingiz mumkin)
    bot.send_photo(
        message.chat.id, 
        file_id, 
        caption=f"👤 **Xodim:** {user_name}\n📌 **Holati:** {caption}\n🆔 **ID:** {user_id}"
    )
    bot.reply_to(message, "Davomatingiz rasm bilan muvaffaqiyatli qabul qilindi!")

# /xodimlar buyruqi
@bot.message_handler(commands=['xodimlar'])
def cmd_xodimlarni_korish(message):
    xodimlar_royxati = "Hozircha ulangan xodimlar ro'yxati."
    bot.send_message(message.chat.id, f"📋 **Ulangan xodimlar:**\n\n{xodimlar_royxati}", parse_mode="Markdown")

if __name__ == '__main__':
    print("Bot ishga tushdi...")
    bot.infinity_polling()
