require("dotenv").config();
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { saveAudio, getAudio, saveUrlCache, getUrlCache } = require("./db");
const { downloadFromIgPost } = require("./handlers/igpost");
const { downloadFromIgReels } = require("./handlers/igreels");
const { downloadFromTikwm } = require("./handlers/tiktok");
const { downloadFromFacebook } = require("./handlers/facebook");
const { init, saveUser, getAllUsers } = require("./userdb");
const { initLog, logRequest, countRequestsLast7Days } = require("./logdb");
const { promisify } = require("util");
const countLast7Days = promisify(countRequestsLast7Days);

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_IDS = process.env.ADMIN_ID.split(",");

init();
initLog();
console.log("✅ Bot Telegram aktif...");

function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

let startTime = Date.now();
const adminSession = new Map();

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  saveUser(chatId);

  if (ADMIN_IDS.includes(chatId.toString()) && adminSession.has(chatId)) {
    const state = adminSession.get(chatId);
    if (text && text.toLowerCase() === "/cancel") {
      adminSession.delete(chatId);
      return bot.sendMessage(chatId, "❌ Broadcast dibatalkan.");
    }

    if (state === "AWAITING_BROADCAST") {
      getAllUsers(async (err, userIds) => {
        if (err) {
          adminSession.delete(chatId);
          return bot.sendMessage(chatId, "❌ Gagal ambil daftar user.");
        }

        for (const id of userIds) {
          try {
            let sent;
            if (msg.photo) {
              const photo = msg.photo[msg.photo.length - 1].file_id;
              sent = await bot.sendPhoto(id, photo, { caption: msg.caption || "" });
            } else if (msg.video) {
              sent = await bot.sendVideo(id, msg.video.file_id, { caption: msg.caption || "" });
            } else if (msg.document) {
              sent = await bot.sendDocument(id, msg.document.file_id, { caption: msg.caption || "" });
            } else {
              sent = await bot.sendMessage(id, text);
            }
            await bot.pinChatMessage(id, sent.message_id).catch(() => {});
          } catch {}
        }

        adminSession.delete(chatId);
      });
      return;
    }
  }

  if (!text || !text.startsWith("http")) {
    const menuMsg = await bot.sendMessage(chatId, `*_✨ BOT ONLINE ✨\n✨SILAHKAN DIGUNAKAN✨\n
      ✅ Tiktok
      ✅ Facebook
      ✅ Instagram_*`, {
      parse_mode: "MarkdownV2",
    });

    setTimeout(() => {
      bot.deleteMessage(chatId, menuMsg.message_id).catch(() => {});
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }, 4000);
    return;
  }

  const waitingMsg = await bot.sendMessage(chatId, "*_⏳ Sedang diproses, tunggu sebentar ⏳_ *", {
    parse_mode: "MarkdownV2"
  });

  try {
    const url = text;
    getUrlCache(url, async (err, cached) => {
      if (err) {
        await bot.sendMessage(chatId, "❌ Gagal memeriksa cache.");
        return await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
      }

      const caption = escapeMarkdown("Diunduh melalui: @iniuntukdonlotvidiotiktokbot");
      const audioKey = `audio-${msg.message_id}`;

      if (cached) {
        const videoMsg = await bot.sendVideo(chatId, cached.video_url, {
          caption: escapeMarkdown(cached.caption || caption),
          parse_mode: "MarkdownV2",
          reply_markup: cached.audio_url ? {
            inline_keyboard: [[{ text: "MUSIK", callback_data: audioKey }]]
          } : undefined
        });

        if (cached.audio_url) {
          saveAudio(audioKey, cached.audio_url, chatId, videoMsg.message_id);
        }

        return await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
      }

      if (/instagram\.com/.test(url)) {
        logRequest("instagram");

        if (/\/reel\//.test(url)) {
          const result = await downloadFromIgReels(url);
          const videoBuffer = await axios.get(result.url, { responseType: "arraybuffer" });
          await bot.sendVideo(chatId, Buffer.from(videoBuffer.data), { caption, parse_mode: "MarkdownV2" });
          saveUrlCache(url, "instagram", result.url, null, caption);
        } else {
          const mediaList = await downloadFromIgPost(url);
          const photoGroup = [];

          for (let i = 0; i < mediaList.length; i++) {
            const item = mediaList[i];
            const mediaBuffer = await axios.get(item.url, { responseType: "arraybuffer" });

            if (item.type === "image") {
              photoGroup.push({
                type: "photo",
                media: Buffer.from(mediaBuffer.data),
                ...(photoGroup.length === 0 ? { caption, parse_mode: "MarkdownV2" } : {})
              });
            } else if (item.type === "video") {
              await bot.sendVideo(chatId, Buffer.from(mediaBuffer.data), {
                caption: (i === 0 && photoGroup.length === 0) ? caption : undefined,
                parse_mode: "MarkdownV2",
              });
              if (mediaList.length === 1) {
                saveUrlCache(url, "instagram", item.url, null, caption);
              }
            }
          }

          if (photoGroup.length > 0) {
            await bot.sendMediaGroup(chatId, photoGroup);
            if (mediaList.length === photoGroup.length) {
              saveUrlCache(url, "instagram", null, null, caption);
            }
          }
        }

        return await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
      }

      if (/facebook\.com|fb\.watch|fb\.com/.test(url)) {
        logRequest("facebook");

        const result = await downloadFromFacebook(url);
        const videoMsg = await bot.sendVideo(chatId, result.video, {
          caption,
          parse_mode: "MarkdownV2"
        });

        saveUrlCache(url, "facebook", result.video, null, caption);
        return await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
      }

      if (/tiktok\.com/.test(url)) {
        const result = await downloadFromTikwm(url);
        logRequest("tiktok");

        if (result.type === "slide") {
          await bot.sendMediaGroup(chatId, result.images);
          return await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
        }

        const videoMsg = await bot.sendVideo(chatId, result.video, {
          caption,
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[{ text: "MUSIK", callback_data: audioKey }]]
          }
        });

        saveAudio(audioKey, result.audioUrl, chatId, videoMsg.message_id);
        saveUrlCache(url, "tiktok", result.video, result.audioUrl, caption);

        return await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
      }

      throw new Error("❌ Link tidak dikenali. Hanya mendukung TikTok, Facebook, dan Instagram.");
    });
  } catch (err) {
    await bot.sendMessage(chatId, escapeMarkdown(`⚠️ Error: ${err.message}`), {
      parse_mode: "MarkdownV2"
    });
    await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
  }
});

bot.on("callback_query", async (query) => {
  const key = query.data;
  getAudio(key, async (err, row) => {
    if (err || !row) {
      return bot.answerCallbackQuery(query.id, {
        text: "❌ Audio tidak ditemukan.",
        show_alert: true,
      });
    }

    try {
      const audioMsg = await bot.sendAudio(row.chat_id, row.audio_url, {
        caption: "Diunduh melalui: @iniuntukdonlotvidiotiktokbot",
        parse_mode: "MarkdownV2"
      });

      await bot.deleteMessage(row.chat_id, row.video_msg_id).catch(() => {});
      await bot.editMessageReplyMarkup({
        inline_keyboard: [[{ text: "LINK MUSIK", url: row.audio_url }]]
      }, {
        chat_id: row.chat_id,
        message_id: audioMsg.message_id
      });

      bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error("Gagal kirim audio:", error);
      await bot.sendMessage(row.chat_id, "❌ Gagal memproses file.");
      bot.answerCallbackQuery(query.id, {
        text: "❌ Terjadi kesalahan.",
        show_alert: true,
      });
    }
  });
});

bot.onText(/^\/(broadcast|stats|cancel)$/, (msg) => {
  const chatId = msg.chat.id.toString();
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "ngapain bang?, ini fitur khusus admin🗿");
  }
});

bot.onText(/^\/broadcast$/, (msg) => {
  const senderId = msg.chat.id.toString();
  if (!ADMIN_IDS.includes(senderId)) return;

  adminSession.set(msg.chat.id, "AWAITING_BROADCAST");
  bot.sendMessage(msg.chat.id, "📢 Masukkan isi pengumuman (bisa teks atau media):\nKetik /cancel untuk membatalkan.");
});

bot.onText(/^\/stats$/, (msg) => {
  if (!ADMIN_IDS.includes(msg.chat.id.toString())) return;

  getAllUsers((err, userIds) => {
    if (err) return bot.sendMessage(msg.chat.id, "❌ Gagal mengambil user.");

    Promise.all([
      countLast7Days("tiktok"),
      countLast7Days("facebook"),
      countLast7Days("instagram")
    ]).then(([tiktokCount, fbCount, igCount]) => {
      const uptimeMs = Date.now() - startTime;
      const uptimeH = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeM = Math.floor((uptimeMs / (1000 * 60)) % 60);
      const uptimeStr = `${uptimeH} jam ${uptimeM} menit`;

      const statMsg = `
\`\`\`
✨STATISTIK BOT✨
🧽 7 HARI
————————————————————————
🀄️ Total User        : ${userIds.length}
💌 Request TikTok    : ${tiktokCount}
💌 Request Facebook  : ${fbCount}
💌 Request Instagram : ${igCount}
⌚️ Uptime            : ${uptimeStr}
\`\`\`
`;

      bot.sendMessage(msg.chat.id, statMsg, { parse_mode: "MarkdownV2" });
    }).catch(() => {
      bot.sendMessage(msg.chat.id, "❌ Gagal mengambil statistik.");
    });
  });
});
