import telebot
from telebot import types

# Tokeningizni shu yerga yozing
TOKEN = "SIZNING_BOT_TOKENINGIZ"
bot = telebot.TeleBot(TOKEN)

# /xodimlar buyruqi
@bot.message_handler(commands=['xodimlar'])
def cmd_xodimlarni_korish(message):
    # Bu yerda bazadan ulangan xodimlar ro'yxatini olish kodini yozishingiz mumkin
    # Hozircha oddiy namuna matn qaytaradi:
    
    xodimlar_royxati = "Hozircha ulangan xodimlar ro'yxati bo'sh yoki bazadan ma'lumot kelmadi."
    
    # Reklama va majburiy obuna shartisiz to'g'ridan-to'g'ri natijani yuboradi
    bot.send_message(message.chat.id, f"📋 **Ulangan xodimlar:**\n\n{xodimlar_royxati}", parse_mode="Markdown")

# Boshqa xabarlar uchun
@bot.message_handler(func=lambda message: True)
def echo_all(message):
    bot.reply_to(message, "Buyruqni tushunarsiz yubordingiz yoki bunday buyruq yo'q. /xodimlar buyruqidan foydalaning.")

if __name__ == '__main__':
    print("Bot ishga tushdi...")
    bot.infinity_polling()
