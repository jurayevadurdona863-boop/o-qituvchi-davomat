import telebot

# Tokeningiz
TOKEN = "9241880191:AAHfYqQSQC9KOpeAfFdomyft9nhIBm-h6sk"
bot = telebot.TeleBot(TOKEN)

# Xodimlar keldim/ketdim deb rasm yuborganda ishlaydigan qism
@bot.message_handler(content_types=['photo'])
def handle_davomat_photo(message):
    user_name = message.from_user.full_name
    username = f"@{message.from_user.username}" if message.from_user.username else "Kiritilmagan"
    caption = message.caption or "Izoh yozilmagan"
    
    # Rasmni olish
    file_id = message.photo[-1].file_id
    
    # Xabarni yuborgan chatga (yoki admin guruhiga) rasm va ma'lumotni tashlab beradi
    bot.send_photo(
        message.chat.id, 
        file_id, 
        caption=(
            f"📸 **Yangi Davomat Xabari!**\n\n"
            f"👤 **F.I.O:** {user_name}\n"
            f"🔗 **Username:** {username}\n"
            f"📌 **Holati:** {caption}"
        ),
        parse_mode="Markdown"
    )

# /start yoki /xodimlar buyruqlari uchun (reklamasiz)
@bot.message_handler(commands=['start', 'xodimlar'])
def send_welcome(message):
    bot.reply_to(message, "Bot faol holatda. Xodimlar ilovadan rasm yuborishi mumkin.")

if __name__ == '__main__':
    print("Bot ishga tushdi...")
    bot.infinity_polling()
