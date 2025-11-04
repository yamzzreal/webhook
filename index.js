const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('ssh2'); // ← gunakan SSH2
const uuid = require("crypto");
const { owner, ownerName, botName, token, photoURL, ADMIN_IDS, CHANNEL_ID } = require('./setting');
const path = require("path");
const axios = require('axios');
const FormData = require('form-data');
const setting = require('./setting.js');
const url = setting.url;
const port = setting.port;
const Tokeninstall = setting.tokeninstall;
const Bash = setting.bash;
const premiumUsersFile = 'premiumUsers.json';
const domain = setting.domain;
const plta = setting.plta;
const pltc = setting.pltc;
const domainv2 = setting.domainv2;
const pltav2 = setting.pltav2;
const pltcv2 = setting.pltcv2;
const fs = require("fs-extra");
const express = require("express");
const app = express();
app.use(express.json());

app.post("/webhook/saweria", (req, res) => {
  const data = req.body.data;

  // Invoice diambil dari "message", "note", atau custom field
  const invoiceId = data.note;
  const amount = Number(data.amount);

  let invoiceDB = loadInvoice();
  let inv = invoiceDB.find(v => v.invoiceId === invoiceId);
  if (!inv) return res.send("NO-INVOICE");

  inv.status = "PAID";
  saveInvoice(invoiceDB);

  // Tambah ke saldo user
  let users = loadUsers();
  let user = users.find(u => u.id === inv.userId);
  if (!user) {
    user = { id: inv.userId, saldo: 0 };
    users.push(user);
  }
  user.saldo += amount;
  saveUsers(users);

  // Notify user
  bot.sendMessage(inv.userId,
    `✅ Topup berhasil!\n+${amount} saldo telah ditambahkan`
  );

  res.send("OK");
});

let saldo = {};

let bot; // bot instance
const usersFile = path.join(__dirname, "data/saldoUser.json");
const historyFile = path.join(__dirname, "data/topup.json");
const transaksiFile = path.join(__dirname, "data/transactions.json");

// Buat file jika belum ada
function ensureFile(file, defaultVal) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2));
  }
}
ensureFile(usersFile, []);
ensureFile(historyFile, []);
ensureFile(transaksiFile, []);

function loadUsers() {
  return JSON.parse(fs.readFileSync(usersFile));
}

function saveUsers(data) {
  fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));
}

function loadHistory() {
  return JSON.parse(fs.readFileSync(historyFile));
}

function saveHistory(data) {
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
}

function loadTransaksi() {
  return JSON.parse(fs.readFileSync(transaksiFile));
}

function saveTransaksi(data) {
  fs.writeFileSync(transaksiFile, JSON.stringify(data, null, 2));
}

function loadInvoice() {
  return JSON.parse(fs.readFileSync("./data/invoice.json"));
}

function saveInvoice(data) {
  fs.writeFileSync("./data/invoice.json", JSON.stringify(data, null, 2));
}
// End Fungsi Topup
try {
    premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
} catch (error) {
    console.error('Error reading premiumUsers file:', error);
}

function setBotInstance(botInstance) {
  bot = botInstance;
    
// Cooldown system
const COOLDOWN_TIME = 20000; 
const cooldown = new Map();

function checkCooldown(userId) {
    const now = Date.now();
    if (cooldown.has(userId)) {
        const expirationTime = cooldown.get(userId);
        if (now < expirationTime) {
            const remainingTime = Math.ceil((expirationTime - now) / 1000);
            return remainingTime;
        }
    }
    cooldown.set(userId, now + COOLDOWN_TIME);
    return 0;
}

function resetCooldown(userId) {
    cooldown.delete(userId);
}
    
// Retry mechanism untuk handle Telegram API errors
async function withRetry(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            // Hanya retry untuk error tertentu
            if (error.message?.includes('ETELEGRAM') || 
                error.message?.includes('timeout') ||
                error.message?.includes('query is too old') ||
                error.code === 'ECONNRESET') {
                console.log(`🔄 Retry attempt ${attempt} for Telegram API`);
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
                continue;
            }
            throw error;
        }
    }
}
    
// Timeout wrapper untuk fetch
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
    
// Membership functions - OPTIMIZED
async function isMember(userId) {
    try {
        if (!setting.CHANNEL_ID) {
            console.log("⚠️ CHANNEL_ID not set in setting");
            return true;
    }
            
    console.log(`🔍 Checking membership for ${userId} in ${setting.CHANNEL_ID}`);
            
    const member = await withRetry(() => 
         bot.getChatMember(setting.CHANNEL_ID, userId)
        );
            
    console.log(`📊 Member status: ${member.status}`);
            
    const isMember = ['member', 'administrator', 'creator'].includes(member.status);
    console.log(`✅ Is member: ${isMember}`);
            
    return isMember;
            
} catch (error) {
    console.error('❌ Error checking membership:', error.message);
            
// Return true untuk error tertentu agar user tetap bisa pakai bot
    if (error.response?.body?.error_code === 400 || 
       error.message?.includes('chat not found')) {
       console.log('🔄 Membership check failed, allowing access');
       return true;
       }
            
     return false;
   }
}
    
async function sendJoinChannel(chatId) {
try {
    let channelId = setting.CHANNEL_ID;
    if (channelId.startsWith('@')) {
        channelId = channelId.substring(1);
    }
            
    const message = `📢 *JOIN CHANNEL REQUIRED*\n\nUntuk menggunakan fitur Tools Menu, kamu harus join channel terlebih dahulu:\n\nhttps://t.me/aboutyamzz`;
            
    await withRetry(() => 
        bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Join Channel", url: `https://t.me/aboutyamzz` }],
                    [{ text: "Sudah Join", callback_data: "check_join" }]
                 ]
             }
         })
     );
} catch (error) {
    console.error('Error sending join message:', error);
  }
}
    
function generateRandomPassword() {
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#%^&*';
const length = 10;
let password = '';
for (let i = 0; i < length; i++) {
const randomIndex = Math.floor(Math.random() * characters.length);
password += characters[randomIndex];
}
return password;
}
    
const dataDir = path.join(__dirname, 'data');
const dataFiles = ['users.json'];
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
for (const f of dataFiles) {
  const filePath = path.join(dataDir, f);
  if (!fs.existsSync(filePath)) fs.writeJsonSync(filePath, []);
  else if (fs.readFileSync(filePath, 'utf8').trim() === '') fs.writeJsonSync(filePath, []);
}

  // ─── /start ───────────────────────────────
  bot.onText(/^\/start$/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeCaption = `
Halo, selamat datang di *${botName}*! 👋
Owner bot ini adalah *${ownerName}*.
Gunakan /menu untuk melihat daftar perintah.
`;

    bot.sendPhoto(chatId, photoURL, {
      caption: welcomeCaption,
      parse_mode: 'Markdown'
    });
  });

// ─── /menu ───────────────────────────────
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
    caption: `
┏━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

Pilih menu yang tersedia di bawah: 👇`,
    reply_markup: {
      inline_keyboard: [
       [{ text: "👤 𝘼𝙠𝙪𝙣 𝙈𝙚𝙣𝙪", callback_data: "akunmenu" }, 
       { text: "🛍 𝙋𝙧𝙤𝙙𝙪𝙠 𝙈𝙚𝙣𝙪", callback_data: "produkmenu" }],
        [{ text: "🛡️ 𝗣𝗿𝗼𝘁𝗲𝗰𝘁 𝗠𝗲𝗻𝘂", callback_data: "protectmenu" }, 
       { text: "🔧 𝗨𝗻𝗣𝗿𝗼𝘁𝗲𝗰𝘁 𝗠𝗲𝗻𝘂", callback_data: "unprotect" }],
      [{ text: "🔥 𝗣𝗮𝗻𝗲𝗹 𝗠𝗲𝗻𝘂", callback_data: "panelmenu" },
     { text: "⚡ 𝗗𝗼𝗺𝗮𝗶𝗻 𝗠𝗲𝗻𝘂", callback_data: "domainmenu" }],
       [{ text: "💫 𝗜𝗻𝘀𝘁𝗮𝗹𝗹 𝗠𝗲𝗻𝘂", callback_data: "installmenu" },
      { text: "💥 𝗙𝗶𝘁𝘂𝗿 𝗠𝗲𝗻𝘂", callback_data: "fiturmenu" }],
        [{ text: "👑 𝗢𝘄𝗻𝗲𝗿 𝗠𝗲𝗻𝘂", callback_data: "ownermenu" },
       { text: "👥 𝗠𝘆 𝗦𝘂𝗽𝗽𝗼𝗿𝘁", callback_data: "thanksto" }]
      ]
    }
  });
});



bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const senderId = query.from.id;
  
  if (data === "menu") {
    bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

Pilih menu yang tersedia di bawah: 👇`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "👤 𝘼𝙠𝙪𝙣 𝙈𝙚𝙣𝙪", callback_data: "akunmenu" }, 
       { text: "🛍 𝙋𝙧𝙤𝙙𝙪𝙠 𝙈𝙚𝙣𝙪", callback_data: "produkmenu" }],
        [{ text: "🛡️ 𝗣𝗿𝗼𝘁𝗲𝗰𝘁 𝗠𝗲𝗻𝘂", callback_data: "protectmenu" }, 
       { text: "🔧 𝗨𝗻𝗣𝗿𝗼𝘁𝗲𝗰𝘁 𝗠𝗲𝗻𝘂", callback_data: "unprotect" }],
      [{ text: "🔥 𝗣𝗮𝗻𝗲𝗹 𝗠𝗲𝗻𝘂", callback_data: "panelmenu" },
     { text: "⚡ 𝗗𝗼𝗺𝗮𝗶𝗻 𝗠𝗲𝗻𝘂", callback_data: "domainmenu" }],
       [{ text: "💫 𝗜𝗻𝘀𝘁𝗮𝗹𝗹 𝗠𝗲𝗻𝘂", callback_data: "installmenu" },
      { text: "💥 𝗙𝗶𝘁𝘂𝗿 𝗠𝗲𝗻𝘂", callback_data: "fiturmenu" }],
        [{ text: "👑 𝗢𝘄𝗻𝗲𝗿 𝗠𝗲𝗻𝘂", callback_data: "ownermenu" },
       { text: "👥 𝗠𝘆 𝗦𝘂𝗽𝗽𝗼𝗿𝘁", callback_data: "thanksto" }]
      ]
    }
  });
  
  } else if (data === "akunmenu") {
    bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", {
    caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━[ 𝗠𝗘𝗡𝗨 𝙄𝙉𝙁𝙊 𝘼𝙆𝙐𝙉 ]
┃ ϟ /topup [ ɪsɪ sᴀʟᴅᴏ ]
┃ ϟ /ceksaldo [ ᴄᴇᴋ sᴀʟᴅᴏ ]
┃ ϟ /cekhistory [ ᴄᴇᴋ ʜɪsᴛᴏʀʏ ᴛᴏᴘᴜᴘ ]
╰━━━━━━━━━━━━━━━━━━━━━━
`,
    parse_mode: "Markdown",
    reply_markup: {
        inline_keyboard: [
            [{ text: "🛍 𝙋𝙧𝙤𝙙𝙪𝙠 𝙈𝙚𝙣𝙪", callback_data: " produkmenu" }],
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
    }
});
  } else if (data === "produkmenu") {
    bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", {
    caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━[ 𝙇𝙄𝙎𝙏 𝙋𝙍𝙊𝘿𝙐𝙆 𝙈𝙀𝙉𝙐 ]
┃ ϟ /panel [ ORDER PANEL ]
┃ ϟ /script [ ORDER SCRIPT PROTECT ]
┃ ϟ /ptero [ INSTALL PANEL ]
┃ ϟ /protect [ PASANG PROTECT ]
╰━━━━━━━━━━━━━━━━━━━━━━
`,
    parse_mode: "Markdown",
    reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
    }
});
  } else if (data === "protectmenu") {
    bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", {
    caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━[ 𝗠𝗘𝗡𝗨 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 ]
┃ ϟ /installprotect1
┃ ϟ /installprotect2
┃ ϟ /installprotect3
┃ ϟ /installprotect4
┃ ϟ /installprotect5
┃ ϟ /installprotect6
┃ ϟ /installprotect7
┃ ϟ /installprotect8
┃ ϟ /installprotect9
┃ ϟ /installprotectall
╰━━━━━━━━━━━━━━━━━━━━━━
`,
    parse_mode: "Markdown",
    reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
    }
});
  } else if (data === "unprotect") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗨𝗡𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 ⟯ 
┃▢ /uninstallprotect1
┃▢ /uninstallprotect2
┃▢ /uninstallprotect3
┃▢ /uninstallprotect4
┃▢ /uninstallprotect5
┃▢ /uninstallprotect6
┃▢ /uninstallprotect7
┃▢ /uninstallprotect8
┃▢ /uninstallprotect9
┃▢ /uninstallprotectall
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "installmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗔𝗡𝗘𝗟 ⟯ 
┃▢ /installpanel1 versi 20.04
┃▢ /installpanel2 versi 22.04 / 24.04
┃▢ /installwings
┃▢ /resetpwvps
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "panelmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗣𝗔𝗡𝗘𝗟 𝗣𝗧𝗘𝗥𝗢𝗗𝗔𝗖𝗧𝗬𝗟 ⟯ 
┃sɪʟᴀʜᴋᴀɴ ᴘɪʟɪʜ sᴇʀᴠᴇʀ ᴅᴇɴɢᴀɴ ᴋʟɪᴋ ʙᴜᴛᴛᴏɴ
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
           [
           { text: "📡 sᴇʀᴠᴇʀ1", callback_data: "srv1" }, 
           { text: "📡 sᴇʀᴠᴇʀ2", callback_data: "srv2" },
           ],
            [{ text: "📞 ᴏᴡɴᴇʀ", url: "https://t.me/yamzzzx" },
            { text: "📌 ɪɴғᴏʀᴍᴀsɪ", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 ʙᴀᴄᴋ ᴛᴏ ʜᴏᴍᴇ", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "srv1") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝙈𝙀𝙉𝙐 𝙋𝘼𝙉𝙀𝙇 𝙎𝙀𝙍𝙑𝙀𝙍 1 ⟯ 
┃▢ /1gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /2gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /3gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /4gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /5gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /6gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /7gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /8gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /9gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /10gb [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /unli [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /listserver [ ᴛᴏᴛᴀʟ sᴇʀᴠᴇʀ ]
┃▢ /listuser [ ᴛᴏᴛᴀʟ ᴜsᴇʀ ]
┃▢ /delserver [ ʜᴀᴘᴜs sᴇʀᴠᴇʀ ]
┃▢ /deluser [ ʜᴀᴘᴜs ᴜsᴇʀ ]
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
           [
            { text: "📡 sᴇʀᴠᴇʀ2", callback_data: "srv2" },
           ], 
            [{ text: "📞 ᴏᴡɴᴇʀ", url: "https://t.me/yamzzzx" },
            { text: "📌 ɪɴғᴏʀᴍᴀsɪ", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 ʙᴀᴄᴋ ᴛᴏ ʜᴏᴍᴇ", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "srv2") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝙈𝙀𝙉𝙐 𝙋𝘼𝙉𝙀𝙇 𝙎𝙀𝙍𝙑𝙀𝙍 2 ⟯ 
┃▢ /1gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /2gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /3gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /4gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /5gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /6gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /7gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /8gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /9gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /10gbv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /unliv2 [ ᴜsᴇʀɴᴀᴍᴇ,ɪᴅ ᴛᴇʟᴇ ]
┃▢ /listsrv [ ᴛᴏᴛᴀʟ sᴇʀᴠᴇʀ ]
┃▢ /listusr [ ᴛᴏᴛᴀʟ ᴜsᴇʀ ]
┃▢ /delsrv [ ʜᴀᴘᴜs sᴇʀᴠᴇʀ ]
┃▢ /delusr [ ʜᴀᴘᴜs ᴜsᴇʀ ]
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 ᴏᴡɴᴇʀ", url: "https://t.me/yamzzzx" },
            { text: "📌 ɪɴғᴏʀᴍᴀsɪ", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 ʙᴀᴄᴋ ᴛᴏ ʜᴏᴍᴇ", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "domainmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗟𝗜𝗦𝗧 𝗔𝗟𝗟 𝗗𝗢𝗠𝗔𝗜𝗡 ⟯ 
┃▢ yamzzoffc.my.id
╰━━━━━━━━━━━━━━━━━━
╭━━━━⟮ 𝗖𝗔𝗥𝗔 𝗣𝗘𝗡𝗚𝗚𝗨𝗡𝗔𝗔𝗡 ⟯ 
┃▢ /domain1 hostname|ipvps
┃▢ /domain2 hostname|ipvps
┃▢ /domain3 hostname|ipvps
┃▢ /domain4 hostname|ipvps
┃▢ /domain5 hostname|ipvps
┃▢ /domain6 hostname|ipvps
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "fiturmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗙𝗜𝗧𝗨𝗥 ⟯ 
┃▢ /cekid
┃▢ /brat
┃▢ /iqc
┃▢ /tourl
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

bugRequests[chatId] = { stage: "awaitingNumber" }; 
  } else if (data === "ownermenu") {
    bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 2.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⟯ 
┃▢ /addprem 
┃▢ /delprem
┃▢ /addadmin
┃▢ /deladmin
┃▢ /listadmin
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });
  } else if (data === "thanksto") {
    bot.sendPhoto(chatId, "https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg", { 
      caption: `
╭━━━━⟮ 𝗧𝗛𝗔𝗡𝗞𝗦 𝗧𝗢 ⟯ 
┃▢ @yamzzzx 
┃▢ @allah
┃▢ @yamzzzxofc
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });
  }

  bot.answerCallbackQuery(query.id);
});

//=========FITUR TOPUP==========\\
bot.onText(/^\/topup$/, async (msg) => {
  const chatId = msg.chat.id;
  
  const buttons = [
    [
      { text: "5.000", callback_data: "topup_5000" },
      { text: "10.000", callback_data: "topup_10000" },
      { text: "15.000", callback_data: "topup_15000" },
    ],
    [
      { text: "20.000", callback_data: "topup_20000" },
      { text: "25.000", callback_data: "topup_25000" },
      { text: "50.000", callback_data: "topup_50000" },
    ],
    [
      { text: "100.000", callback_data: "topup_100000" },
    ]
  ];

  bot.sendMessage(
    chatId,
    `💰 <b>Topup Saldo</b>\n\nSilakan pilih nominal:`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    }
  );
});

bot.on("callback_query", async (query) => {
  const data = query.data;
  const userId = query.from.id.toString();
  const chatId = query.message.chat.id;
  const saweria = setting.saweria;

  if (!data.startsWith("topup_")) return;

  const amount = Number(data.split("_")[1]);
  const invoiceId = "INV-" + Math.floor(Math.random() * 999999);

  let invoiceDB = loadInvoice();

  invoiceDB.push({
    invoiceId,
    userId,
    amount,
    status: "PENDING",
    created_at: new Date().toLocaleString()
  });

  saveInvoice(invoiceDB);

  // Link saweria + invoiceId sebagai note
  const payUrl = `${saweria}?invoice=${invoiceId}`;

  const text = `
🧾 <b>Invoice Created</b>

🆔 Invoice : <code>${invoiceId}</code>
💰 Harga   : <b>${amount}</b>
🔄 Status  : <b>Menunggu Pembayaran</b>

Klik tombol di bawah untuk melakukan pembayaran.
  `;

  bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "💸 Bayar Sekarang", url: payUrl }]
      ]
    }
  });

  bot.answerCallbackQuery(query.id);
});


bot.onText(/^\/ceksaldo$/, (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  const users = loadUsers();
  let user = users.find(u => u.id === userId);

  if (!user) {
    user = { id: userId, saldo: 0 };
    users.push(user);
    saveUsers(users);
  }

  bot.sendMessage(chatId, `💰 Saldo kamu: <b>${user.saldo}</b>`, { parse_mode: "HTML" });
});

bot.onText(/^\/cekhistory$/, (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  const history = loadHistory().filter(h => h.userId === userId);

  if (history.length === 0) {
    return bot.sendMessage(chatId, `📜 Kamu belum pernah topup.`);
  }

  let txt = "📜 <b>Riwayat Topup</b>\n\n";

  history.forEach((v, i) => {
    txt += `${i+1}) +${v.amount} — ${v.date}\n`;
  });

  bot.sendMessage(chatId, txt, { parse_mode: "HTML" });
});

bot.onText(/^\/cektransaksi$/, (msg) => {
  const chatId = msg.chat.id;
  const from = msg.from.id.toString();

  if (from !== owner) return bot.sendMessage(chatId, "❌ Hanya Owner.");

  const data = loadTransaksi();

  if (data.length === 0)
    return bot.sendMessage(chatId, `Tidak ada transaksi.`);

  let txt = `📁 <b>Semua Transaksi</b>\n\n`;
  data.forEach((v, i) => {
    txt += `${i+1}) User: ${v.userId} — +${v.amount} — ${v.date}\n`;
  });

  bot.sendMessage(chatId, txt, { parse_mode: "HTML" });
});


  // ─── /fiturpremium ───────────────────────
  bot.onText(/\/addprem (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];
    
    if (msg.from.id.toString() === owner) {
        if (!premiumUsers.includes(userId)) {
            premiumUsers.push(userId);
            fs.writeFileSync(premiumUsersFile, JSON.stringify(premiumUsers));
            bot.sendMessage(chatId, `User ${userId} has been added to premium users.`);
        } else {
            bot.sendMessage(chatId, `User ${userId} is already a premium user.`);
        }
    } else {
        bot.sendMessage(chatId, 'Only the owner can perform this action.');
    }
});
  
bot.onText(/\/delprem (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];  
    if (msg.from.id.toString() === owner) {
        const index = premiumUsers.indexOf(userId);
        if (index !== -1) {
            premiumUsers.splice(index, 1);
            fs.writeFileSync(premiumUsersFile, JSON.stringify(premiumUsers));
            bot.sendMessage(chatId, `User ${userId} has been removed from premium users.`);
        } else {
            bot.sendMessage(chatId, `User ${userId} is not a premium user.`);
        }
    } else {
        bot.sendMessage(chatId, 'Only the owner can perform this action.');
    }
});
  
  bot.onText(/^\/fiturpremium$/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!premiumUsers.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Kamu bukan user premium!');
    }

    bot.sendMessage(chatId, '✨ Selamat datang di fitur *Premium Eksklusif*!', { parse_mode: 'Markdown' });
  });

bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  const senderId = msg.from.id;
  const newAdminId = Number(match[1]);

  if (!setting.ADMIN_IDS.includes(senderId))
    return bot.sendMessage(senderId, "❌ Kamu tidak punya izin menambah admin.");

  if (setting.ADMIN_IDS.includes(newAdminId))
    return bot.sendMessage(senderId, "⚠️ User ini sudah menjadi admin.");

  setting.ADMIN_IDS.push(newAdminId);

  // Simpan ke settingjs
  const configPath = path.join(__dirname, "setting.js");
  const updatedConfig = `export default ${JSON.stringify(setting, null, 2)};\n`;
  fs.writeFileSync(configPath, updatedConfig, "utf8");

  await bot.sendMessage(senderId, `✅ Admin baru berhasil ditambahkan!\n👤 ID: <code>${newAdminId}</code>`, { parse_mode: "HTML" });

  try {
    await bot.sendMessage(newAdminId, `🎉 Kamu telah ditambahkan sebagai *Admin* oleh <b>${msg.from.first_name}</b>.`, { parse_mode: "HTML" });
  } catch (err) {
    console.log("Gagal kirim notifikasi ke admin baru:", err.message);
  }
});

// === /deladmin <user_id> ===
bot.onText(/\/deladmin (\d+)/, async (msg, match) => {
  const senderId = msg.from.id;
  const targetId = Number(match[1]);

  if (!setting.ADMIN_IDS.includes(senderId))
    return bot.sendMessage(senderId, "❌ Kamu tidak punya izin menghapus admin.");

  if (!setting.ADMIN_IDS.includes(targetId))
    return bot.sendMessage(senderId, "⚠️ User ini bukan admin.");

  setting.ADMIN_IDS = premiumUsers.filter(id => id !== targetId);

  // Simpan ke setting.js
  const configPath = path.join(__dirname, "setting.js");
  const updatedConfig = `export default ${JSON.stringify(setting, null, 2)};\n`;
  fs.writeFileSync(configPath, updatedConfig, "utf8");

  await bot.sendMessage(senderId, `🗑️ Admin dengan ID <code>${targetId}</code> berhasil dihapus.`, { parse_mode: "HTML" });

  try {
    await bot.sendMessage(targetId, `⚠️ Kamu telah dihapus dari daftar *Admin Bot*.`, { parse_mode: "HTML" });
  } catch (err) {
    console.log("Gagal kirim notifikasi ke user:", err.message);
  }
});

// === /listadmin ===
bot.onText(/\/listadmin/, async (msg) => {
  const userId = msg.from.id;
  if (!setting.ADMIN_IDS.includes(userId))
    return bot.sendMessage(userId, "❌ Hanya admin yang bisa melihat daftar admin.");

  if (!setting.ADMIN_IDS.length)
    return bot.sendMessage(userId, "📭 Belum ada admin yang terdaftar.");

  let text = "👑 <b>Daftar Admin Aktif:</b>\n";
  for (const id of setting.ADMIN_IDS) {
    text += `• <code>${id}</code>\n`;
  }

  await bot.sendMessage(userId, text, { parse_mode: "HTML" });
});

  // ─── /cekid acc tele ────────────────────
bot.onText(/\/cekid/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'Tidak Ada';
    const idTele = msg.from.id;
    const cekIdImageUrl = 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg'; // Ganti dengan URL banner

    const caption = `👋 Hi *${username}*\n\n` +
        `📌 *ID Telegram Anda:* \`${idTele}\`\n` +
        `📌 *Username:* @${username}\n\n` +
        `Itu adalah ID Telegram Anda 😉\n` +
        `Developer: @yamzzzx`;

    const options = {
        caption: caption,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📋 Salin ID', url: `tg://msg?text=${idTele}` }
                ],
                [
                    { text: '📤 Bagikan ID', switch_inline_query: idTele }
                ],
                [
                    { text: '👤 Lihat Profil', url: `https://t.me/${username}` }
                ]
            ]
        }
    };

    bot.sendPhoto(chatId, cekIdImageUrl, options);
});

// ─── /iqc ────────────────────
    bot.onText(/\/iqc(.*)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = match[1]?.trim();

        // ✅ CHECK MEMBERSHIP FIRST
        const joined = await isMember(userId);
        if (!joined) {
            await sendJoinChannel(chatId);
            return;
        }

        if (!text) {
            return await withRetry(() =>
                bot.sendMessage(chatId, "⚠️ Format:\n/iqc jam|batre|provider|pesan\n\nContoh:\n/iqc 18:00|40|Indosat|hai hai")
            );
        }

        const [time, battery, carrier, ...pesan] = text.split("|");
        if (!time || !battery || !carrier || pesan.length === 0) {
            return await withRetry(() =>
                bot.sendMessage(chatId, "⚠️ Format salah!\nGunakan:\n/iqc jam|batre|provider|pesan")
            );
        }

        const messageText = pesan.join("|").trim();
        const url = `https://brat.siputzx.my.id/iphone-quoted?time=${encodeURIComponent(time)}&batteryPercentage=${encodeURIComponent(battery)}&carrierName=${encodeURIComponent(carrier)}&messageText=${encodeURIComponent(messageText)}&emojiStyle=apple`;

        await withRetry(() =>
            bot.sendMessage(chatId, "⏳ Sedang membuat gambar, tunggu sebentar...")
        );

        try {
            const res = await fetchWithTimeout(url, {}, 30000);
            if (!res.ok) throw new Error(`Gagal ambil API: ${res.status}`);

            const buffer = Buffer.from(await res.arrayBuffer());

            if (buffer.length < 1000) throw new Error("API tidak kirim gambar valid");

            await withRetry(() =>
                bot.sendPhoto(chatId, buffer, {
                    caption: `✅ *Sukses Membuat Gaya iPhone!*\n🕒 ${time}\n🔋 ${battery}% | ${carrier}\n💬 ${messageText}`,
                    parse_mode: "Markdown"
                })
            );

        } catch (err) {
            console.error("Error di /iqc:", err.message);
            await withRetry(() =>
                bot.sendMessage(chatId, `❌ Gagal membuat gambar: ${err.message}\n\n📄 Fallback:\n🕒 ${time}\n🔋 ${battery}% | ${carrier}\n💬 ${messageText}`)
            );
        }
    });

// ─── /tourl ────────────────────
    bot.onText(/\/tourl/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // ✅ CHECK MEMBERSHIP FIRST
        const joined = await isMember(userId);
        if (!joined) {
            await sendJoinChannel(chatId);
            return;
        }
        
        const waktu = checkCooldown(userId);
        if (waktu > 0) {
            return await withRetry(() =>
                bot.sendMessage(chatId, `⏳ Tunggu ${waktu} detik sebelum bisa pakai command /tourl lagi!`, { 
                    reply_to_message_id: msg.message_id 
                })
            );
        }
        
        const repliedMsg = msg.reply_to_message;

        if (!repliedMsg || (!repliedMsg.document && !repliedMsg.photo && !repliedMsg.video)) {
            return await withRetry(() =>
                bot.sendMessage(chatId, "⚠️ Reply foto/video/document dengan command /tourl", {
                    reply_to_message_id: msg.message_id
                })
            );
        }

        let fileId, fileName, fileType;

        if (repliedMsg.document) {
            fileId = repliedMsg.document.file_id;
            fileName = repliedMsg.document.file_name || `file_${Date.now()}`;
            fileType = 'document';
        } else if (repliedMsg.photo) {
            const photos = repliedMsg.photo;
            fileId = photos[photos.length - 1].file_id;
            fileName = `photo_${Date.now()}.jpg`;
            fileType = 'photo';
        } else if (repliedMsg.video) {
            fileId = repliedMsg.video.file_id;
            fileName = `video_${Date.now()}.mp4`;
            fileType = 'video';
        }

        try {
            const processingMsg = await withRetry(() =>
                bot.sendMessage(chatId, `⏳ ᴍᴇɴɢᴜᴘʟᴏᴀᴅ ${fileType} ᴋᴇ ᴄᴀᴛʙᴏx...`, { 
                    parse_mode: "Markdown", 
                    reply_to_message_id: msg.message_id 
                })
            );

            const file = await withRetry(() => bot.getFile(fileId));
            const fileLink = `https://api.telegram.org/file/bot${setting.token}/${file.file_path}`;

            const fileResponse = await axios.get(fileLink, { 
                responseType: 'arraybuffer',
                timeout: 60000 
            });
            const buffer = Buffer.from(fileResponse.data);

            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', buffer, {
                filename: fileName,
                contentType: fileResponse.headers['content-type'] || 'application/octet-stream',
            });

            const { data: catboxUrl } = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: form.getHeaders(),
                timeout: 60000
            });

            if (!catboxUrl.startsWith('https://')) {
                throw new Error('Catbox tidak mengembalikan URL yang valid');
            }

            await withRetry(() =>
                bot.editMessageText(`*✅ Sukses Upload ${fileType.toUpperCase()}!*\n\n📎 URL: \`${catboxUrl}\``, {
                    chat_id: chatId,
                    parse_mode: "Markdown",
                    message_id: processingMsg.message_id
                })
            );

        } catch (error) {
            console.error("Upload error:", error?.response?.data || error.message);
            await withRetry(() =>
                bot.sendMessage(chatId, `❌ Gagal mengupload ${fileType} ke Catbox: ${error.message}`, {
                    reply_to_message_id: msg.message_id
                })
            );
        }
    });

// ─── /brat ────────────────────
bot.onText(/^(\.|\#|\/)brat$/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Format salah example /brat katakatabebas`);
  });

bot.onText(/\/brat (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1];

    if (!text) {
        return bot.sendMessage(chatId, 'Contoh penggunaan: /brat teksnya');
    }

    try {
        const imageUrl = `https://kepolu-brat.hf.space/brat?q=${encodeURIComponent(text)}`;
        const tempFilePath = './temp_sticker.webp';
        const downloadFile = async (url, dest) => {
            const writer = fs.createWriteStream(dest);

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        };

        await downloadFile(imageUrl, tempFilePath);

        await bot.sendSticker(chatId, tempFilePath);

        await fs.promises.unlink(tempFilePath);
    } catch (error) {
        console.error(error.message || error);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat membuat stiker. Pastikan teks valid atau coba lagi.');
    }
});

  // ─── /subdomain ────────────────────
bot.onText(/^\/domain1(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain1 hostname|192.168.1.1`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.1.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld1;
      const Apitokentld = setting.apitokentld1;
      const Domaintld = setting.domaintld1;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain2(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain2 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld2;
      const Apitokentld = setting.apitokentld2;
      const Domaintld = setting.domaintld2;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain3(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain3 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld3;
      const Apitokentld = setting.apitokentld3;
      const Domaintld = setting.domaintld3;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain4(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain4 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld4;
      const Apitokentld = setting.apitokentld4;
      const Domaintld = setting.domaintld4;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain5(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain4 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld5;
      const Apitokentld = setting.apitokentld5;
      const Domaintld = setting.domaintld5;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain6(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain4 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld6;
      const Apitokentld = setting.apitokentld6;
      const Domaintld = setting.domaintld6;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

// ─── /installpanel1 ────────────────────
bot.onText(/^(\.|\#|\/)installpanel1$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nPenggunaan: /installpanel1 ipvps,password,domainpnl,domainnode,ramvps ( contoh : 8000 = ram 8 )`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/\/installpanel1 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];
  const t = text.split(',');

  if (!owner.includes(String(msg.from.id))) {
    return bot.sendMessage(chatId, '❌ Fitur Ini Khusus Owner Saya!!!');
  }

  if (t.length < 5) {
    return bot.sendMessage(chatId, '*Format salah!*\nPenggunaan: /installpanel1 ipvps,password,domainpnl,domainnode,ramvps\nContoh: /installpanel1 192.168.1.1,rootpass,sub.domain.com,node.domain.com,8000');
  }

  const [ipvps, passwd, subdomain, domainnode, ramvps] = t;
  const connSettings = {
    host: ipvps,
    port: 22,
    username: 'root',
    password: passwd
  };

  let password = generateRandomPassword();
  const command = 'bash <(curl -s https://pterodactyl-installer.se)';
  const commandWings = 'bash <(curl -s https://pterodactyl-installer.se)';
  const conn = new Client();

  conn.on('ready', () => {
    bot.sendMessage(chatId, `PROSES PENGINSTALLAN SEDANG BERLANGSUNG MOHON TUNGGU 5-10 MENIT`);
    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        installWings(conn, domainnode, subdomain, password, ramvps);
      }).on('data', (data) => {
        handlePanelInstallationInput(data, stream, subdomain, password);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }).connect(connSettings);

  function installWings(conn, domainnode, subdomain, password, ramvps) {
    bot.sendMessage(chatId, `PROSES PENGINSTALLAN WINGS SEDANG BERLANGSUNG MOHON TUNGGU 5 MENIT`);
    conn.exec(commandWings, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        createNode(conn, domainnode, ramvps, subdomain, password);
      }).on('data', (data) => {
        handleWingsInstallationInput(data, stream, domainnode, subdomain);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function createNode(conn, domainnode, ramvps, subdomain, password) {
    const command = `${Bash}`;
    bot.sendMessage(chatId, `MEMULAI CREATE NODE & LOCATION`);
    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        conn.end();
        sendPanelData(subdomain, password);
      }).on('data', (data) => {
        handleNodeCreationInput(data, stream, domainnode, ramvps);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function sendPanelData(subdomain, password) {
    bot.sendMessage(chatId, `*DATA PANEL ANDA*\n\nUSERNAME: admin\nPASSWORD: ${password}\nLOGIN: ${subdomain}\n\nNote: Semua Instalasi Telah Selesai.\nSilahkan Create Allocation Di Node Yang Dibuat Oleh Bot, Ambil Token Configuration, dan ketik *.startwings (token)*\n\nNote: HARAP TUNGGU 1-5 MENIT AGAR WEB DAPAT DIAKSES\n_Script by @yamzzzx`);
  }

  function handlePanelInstallationInput(data, stream, subdomain, password) {
    const inputs = [
      '0', '', '', '1248', 'Asia/Jakarta', 'admin@yamzzoffc.my.id', 'admin@yamzzoffc.my.id',
      'admin', 'adm', 'adm', `${password}`, `${subdomain}`,
      'y', 'y', 'y', 'y', 'yes', 'A', '', '1'
    ];
    if (data.toString().includes('Input') || data.toString().includes('Please read the Terms of Service')) {
      stream.write(inputs.shift() + '\n');
    }
    console.log('STDOUT:', data.toString());
  }

  function handleWingsInstallationInput(data, stream, domainnode, subdomain) {
    const inputs = [
      '1', 'y', 'y', 'y', `${subdomain}`, 'y', 'user', '1248',
      'y', `${domainnode}`, 'y', 'admin@yamzzoffc.my.id', 'y'
    ];
    if (data.toString().includes('Input')) {
      stream.write(inputs.shift() + '\n');
    }
    console.log('STDOUT:', data.toString());
  }

  function handleNodeCreationInput(data, stream, domainnode, ramvps) {
    const inputs = [
      `${Tokeninstall}`, '4', 'SGP', 'Jangan Lupa Support yamzzzx🦅🇮🇩',
      `${domainnode}`, 'NODES', `${ramvps}`, `${ramvps}`, '1'
    ];
    inputs.forEach(i => stream.write(i + '\n'));
    console.log('STDOUT:', data.toString());
  }
});

// ─── /installpanel2 ────────────────────
bot.onText(/^(\.|\#|\/)installpanel2$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nPenggunaan: /installpanel2 ipvps,password,domainpnl,domainnode,ramvps ( contoh : 8000 = ram 8 )`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/\/installpanel2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];
  const t = text.split(',');

  if (!owner.includes(String(msg.from.id))) {
    return bot.sendMessage(chatId, '❌ Fitur Ini Khusus Owner Saya!!!');
  }

  if (t.length < 5) {
    return bot.sendMessage(chatId, 'Format salah!\nPenggunaan: /installpanel2 ipvps,password,domainpnl,domainnode,ramvps (contoh: 8000 = ram 8GB)');
  }

  const [ipvps, passwd, subdomain, domainnode, ramvps] = t;
  const connSettings = {
    host: ipvps,
    port: 22,
    username: 'root',
    password: passwd
  };

  const password = generateRandomPassword();
  const command = 'bash <(curl -s https://pterodactyl-installer.se)';
  const commandWings = 'bash <(curl -s https://pterodactyl-installer.se)';
  const conn = new Client();

  conn.on('ready', () => {
    bot.sendMessage(chatId, `🚀 PROSES INSTALL PANEL SEDANG BERLANGSUNG, MOHON TUNGGU 5-10 MENIT`);
    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        console.log(`Panel install stream closed: ${code}, ${signal}`);
        installWings(conn, domainnode, subdomain, password, ramvps);
      }).on('data', (data) => {
        handlePanelInstallationInput(data, stream, subdomain, password);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }).connect(connSettings);

  function installWings(conn, domainnode, subdomain, password, ramvps) {
    bot.sendMessage(chatId, `🛠️ PROSES INSTALL WINGS, MOHON TUNGGU 5 MENIT`);
    conn.exec(commandWings, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        console.log(`Wings install stream closed: ${code}, ${signal}`);
        createNode(conn, domainnode, ramvps, subdomain, password);
      }).on('data', (data) => {
        handleWingsInstallationInput(data, stream, domainnode, subdomain);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function createNode(conn, domainnode, ramvps, subdomain, password) {
    const command = `${Bash}`; // pastikan variabel Bash terdefinisi atau diubah sesuai kebutuhan
    bot.sendMessage(chatId, `📡 MEMULAI CREATE NODE & LOCATION`);

    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        console.log(`Node creation stream closed: ${code}, ${signal}`);
        conn.end();
        sendPanelData(subdomain, password);
      }).on('data', (data) => {
        handleNodeCreationInput(data, stream, domainnode, ramvps);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function sendPanelData(subdomain, password) {
    bot.sendMessage(chatId, `✅ *DATA PANEL ANDA*\n\n👤 USERNAME: admin\n🔒 PASSWORD: ${password}\n🌐 LOGIN: ${subdomain}\n\n📌 Note: Semua Instalasi Telah Selesai. Silakan create allocation di node yang dibuat oleh bot dan ambil token configuration, lalu ketik /startwings (token)\n🕐 Tunggu 1-5 menit sebelum web bisa diakses.`);
  }

  function handlePanelInstallationInput(data, stream, subdomain, password) {
    const str = data.toString();
    if (str.includes('Input')) {
      stream.write('0\n\n\n1248\nAsia/Jakarta\nadmin@yamzzoffc.my.id\nadmin@yamzzoffc.my.id\nadmin\nadm\nadm\n');
      stream.write(`${password}\n`);
      stream.write(`${subdomain}\n`);
      stream.write('y\ny\ny\ny\ny\n\n1\n');
    }
    if (str.includes('Please read the Terms of Service')) {
      stream.write('Y\n');
    }
    console.log('Panel STDOUT:', str);
  }

  function handleWingsInstallationInput(data, stream, domainnode, subdomain) {
    const str = data.toString();
    if (str.includes('Input')) {
      stream.write('1\ny\ny\ny\n');
      stream.write(`${subdomain}\n`);
      stream.write('y\nuser\n1248\ny\n');
      stream.write(`${domainnode}\n`);
      stream.write('y\nadmin@yamzzoffc.my.id\ny\n');
    }
    console.log('Wings STDOUT:', str);
  }

  function handleNodeCreationInput(data, stream, domainnode, ramvps) {
    stream.write(`${Tokeninstall}\n4\nSGP\nJangan Lupa Support yamzzzx🦅🇮🇩\n`);
    stream.write(`${domainnode}\nNODES\n${ramvps}\n${ramvps}\n1\n`);
    console.log('Node STDOUT:', data.toString());
  }
});

// ─── /installwings ────────────────────
bot.onText(/^(\.|\#|\/)installwings\s(.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = match[2];
    const reply = msg.reply_to_message;

    if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: reply?.message_id || msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }

    let t = text.split(',');
    if (t.length < 3) {
        return bot.sendMessage(chatId, `*Format salah!*\nPenggunaan: /installwings ipvps,password,token (token configuration)`, { parse_mode: 'Markdown' });
    }

    let ipvps = t[0].trim();
    let passwd = t[1].trim();
    let token = t[2].trim();

    const connSettings = {
        host: ipvps,
        port: 22,
        username: 'root',
        password: passwd
    };

    const conn = new Client();

    conn.on('ready', () => {
        bot.sendMessage(chatId, '𝗣𝗥𝗢𝗦𝗘𝗦 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗘 𝗪𝗜𝗡𝗚𝗦');

        conn.exec(Bash, (err, stream) => {
            if (err) {
                bot.sendMessage(chatId, `❌ Terjadi error saat eksekusi command`);
                return conn.end();
            }

            stream.on('close', (code, signal) => {
                console.log('Stream closed with code ' + code + ' and signal ' + signal);
                bot.sendMessage(chatId, '𝗦𝗨𝗖𝗖𝗘𝗦 𝗦𝗧𝗔𝗥𝗧 𝗪𝗜𝗡𝗚𝗦 𝗦𝗜𝗟𝗔𝗛𝗞𝗔𝗡 𝗖𝗘𝗞 𝗡𝗢𝗗𝗘 𝗔𝗡𝗗𝗔😁');
                conn.end();
            }).on('data', (data) => {
                stream.write(`${Tokeninstall}\n`);
                stream.write('3\n');
                stream.write(`${token}\n`);
                console.log('STDOUT: ' + data);
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    }).on('error', (err) => {
        console.log('Connection Error: ' + err);
        bot.sendMessage(chatId, '❌ Katasandi atau IP tidak valid!');
    }).connect(connSettings);
});

// ─── /restartpwvps ────────────────────
bot.onText(/^(\.|\#|\/)resetpwvps(?:\s+(.+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
    const input = match[2]; // isi setelah command

    // Cek Owner
    if (userId !== owner) {
        return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
            reply_to_message_id: targetMessageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
                ]
            }
        });
    }

    // Validasi input
    if (!input || input.split('|').length < 3) {
        return bot.sendMessage(
            chatId,
            `⚠️ Format salah!\nPenggunaan: /resetpwvps ipvps|passwordlama|passwordbaru`,
            { reply_to_message_id: targetMessageId }
        );
    }

    // Pisahkan data input
    const [ipvps, oldPass, newPass] = input.split('|');

    const connSettings = {
        host: ipvps,
        port: 22,
        username: 'root',
        password: oldPass
    };

    const connCommand = `${Bash}`; // pastikan sudah ada global.bash di setting
    const conn = new Client();

    // Fungsi waktu WIB
    const getWIBTime = () => {
        const date = new Date();
        const options = { timeZone: 'Asia/Jakarta', hour12: false };
        return date.toLocaleString('id-ID', options);
    };

    const startTime = getWIBTime();

    bot.sendMessage(chatId, `🔐 *Mengubah Password VPS Dimulai...*\n⏰ Waktu Mulai: ${startTime}`, {
        reply_to_message_id: targetMessageId,
        parse_mode: "Markdown"
    });

    conn.on('ready', () => {
        conn.exec(connCommand, (err, stream) => {
            if (err) throw err;

            stream.on('close', (code, signal) => {
                const endTime = getWIBTime();
                bot.sendMessage(chatId,
                    `✅ *Password VPS Berhasil Diubah!*\n\n📋 *Detail VPS:*\n- 🌐 IP VPS: ${ipvps}\n- 🔑 Password Baru: ${newPass}\n\n⏰ *Waktu Proses:*\n- Mulai: ${startTime}\n- Selesai: ${endTime}\n\n💡 *Catatan:* Simpan data ini dengan baik.`,
                    { parse_mode: "Markdown" }
                );
                conn.end();
            }).on('data', (data) => {
                stream.write(`${Tokeninstall}\n`);
                stream.write('8\n');
                stream.write(`${newPass}\n`);
                stream.write(`${newPass}\n`);
                console.log('STDOUT: ' + data);
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    }).on('error', (err) => {
        console.log('Connection Error: ' + err);
        bot.sendMessage(chatId, '❌ *IP atau Password Salah!*', { parse_mode: "Markdown" });
    }).connect(connSettings);
});

  // ─── /panel pterodactyl 1gb ────────────────────
bot.onText(/\/1gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '1gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '1024';
  const cpu = '30';
  const disk = '1024';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/2gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '2gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '2048';
  const cpu = '60';
  const disk = '2048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/3gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '3gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '3072';
  const cpu = '90';
  const disk = '3072';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/4gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '4gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '4048';
  const cpu = '110';
  const disk = '4048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/5gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '5gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '5048';
  const cpu = '140';
  const disk = '5048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/6gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '6gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '6048';
  const cpu = '170';
  const disk = '6048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

??  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/7gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '7gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '7048';
  const cpu = '200';
  const disk = '7048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/8gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '8gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '8048';
  const cpu = '230';
  const disk = '8048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/9gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '9gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '9048';
  const cpu = '260';
  const disk = '9048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/10gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '10gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '10000';
  const cpu = '290';
  const disk = '10000';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/unli (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + 'unlimited';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '0';
  const cpu = '0';
  const disk = '0';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

  // ─── /listserver ────────────────────
bot.onText(/\/listserver/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;   
// Check if the user is the Owner
    const adminUsers = JSON.parse(fs.readFileSync(adminfile));
    const isAdmin = adminUsers.includes(String(msg.from.id));   
    if (!isAdmin) {
        bot.sendMessage(chatId, 'Perintah Hanya Untuk Owner, Hubungi Admin Saya Untuk Menjadi Owner atau Users Premium...', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }
                    ]
                ]
            }
        });
        return;
    }
    let page = 1; // Mengubah penggunaan args[0] yang tidak didefinisikan sebelumnya
    try {
        let f = await fetch(`${domain}/api/application/servers?page=${page}`, { // Menggunakan backticks untuk string literal
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
            }
        });
        let res = await f.json();
        let servers = res.data;
        let messageText = "Daftar server aktif yang dimiliki:\n\n";
        for (let server of servers) {
            let s = server.attributes;

            let f3 = await fetch(`${domain}/api/client/servers/${s.uuid.split('-')[0]}/resources`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pltc}`
                }
            });
            let data = await f3.json();
            let status = data.attributes ? data.attributes.current_state : s.status;

            messageText += `ID Server: ${s.id}\n`;
            messageText += `Nama Server: ${s.name}\n`;
            messageText += `Status: ${status}\n\n`;
        }

        bot.sendMessage(chatId, messageText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Terjadi kesalahan dalam memproses permintaan.');
    }
});

  // ─── /clearserver ────────────────────
bot.onText(/^\/clearserver (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Validasi premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(userId));
  if (!isPremium) {
    return bot.sendMessage(chatId, '❌ Fitur ini hanya untuk pengguna premium.');
  }

  const excludedIds = match[1]
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  bot.sendMessage(chatId, `⛔ ID yang dilewati: ${excludedIds.join(', ')}`);

  try {
    const response = await fetch(`${domain}/api/application/servers`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${plta}`,
      },
    });

    const res = await response.json();
    const servers = res.data;

    if (!servers || servers.length === 0) {
      return bot.sendMessage(chatId, '⚠️ Tidak ada server yang ditemukan.');
    }

    for (const server of servers) {
      const serverId = String(server.attributes.id);

      if (excludedIds.includes(serverId)) {
        await bot.sendMessage(chatId, `➡️ Lewati server ID: ${serverId}`);
        continue;
      }

      const deleteRes = await fetch(`${domain}/api/application/servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pltc}`,
        },
      });

      if (deleteRes.ok) {
        await bot.sendMessage(chatId, `✅ Berhasil hapus server: ${serverId}`);
      } else {
        const errText = await deleteRes.text();
        await bot.sendMessage(chatId, `❌ Gagal hapus server ID: ${serverId}\n${errText}`);
      }
    }

    await bot.sendMessage(chatId, '✔️ Proses penghapusan selesai.');
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${err.message}`);
  }
});

  // ─── /listuser ────────────────────
bot.onText(/\/listuser/, async (msg) => {
  const chatId = msg.chat.id;
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));
  if (!isPremium) {
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });
    return;
  }

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${plta}`
      }
    });

    const json = await response.json();
    const users = json.data;
    if (!users || users.length === 0) return bot.sendMessage(chatId, "Tidak ada user yang terdaftar di panel.");

    let teks = `📋 *List User Panel:*\n\n`;
    for (let i of users) {
      const { id, username, root_admin, first_name } = i.attributes;
      const adminStatus = root_admin ? "⭐" : "❌";
      teks += `🆔 *${id}* - *${username}*\n👤 ${first_name} ${adminStatus}\n\n`;
    }

    bot.sendMessage(chatId, teks, { parse_mode: "Markdown" });
  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "Gagal mengambil data user panel.");
  }
});

  // ─── /clearuser ────────────────────
bot.onText(/\/clearuser/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Cek apakah yang akses owner
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  const isAdmin = adminUsers.includes(String(userId));

  if (!isAdmin) {
    return bot.sendMessage(chatId, 'Perintah ini hanya untuk Owner.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Hubungi Admin', url: 'https://t.me/yamzzzx' }]]
      }
    });
  }

  try {
    const res = await fetch(`${domain}/api/application/users`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      }
    });

    const data = await res.json();
    const users = data.data;

    if (!users || users.length < 1) {
      return bot.sendMessage(chatId, "Tidak ada user yang ditemukan.");
    }

    let deleted = 0;
    for (const user of users) {
      const { id, username, root_admin } = user.attributes;
      if (root_admin === true) continue; // Lewati jika admin

      const del = await fetch(`${domain}/api/application/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${plta}`
        }
      });

      if (del.ok) {
        deleted++;
        await bot.sendMessage(chatId, `✅ Berhasil hapus user: ${username} (ID: ${id})`);
      } else {
        const err = await del.text();
        await bot.sendMessage(chatId, `❌ Gagal hapus user ID: ${id} - ${err}`);
      }
    }

    if (deleted === 0) {
      bot.sendMessage(chatId, "Tidak ada user yang berhasil dihapus.");
    } else {
      bot.sendMessage(chatId, `Selesai menghapus ${deleted} user yang bukan admin.`);
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `Terjadi kesalahan: ${err.message}`);
  }
});
//========= CPANEL SERVER 2 =======\\
bot.onText(/\/1gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '1gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '1024';
  const cpu = '30';
  const disk = '1024';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/2gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '2gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '2048';
  const cpu = '60';
  const disk = '2048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/3gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '3gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '3072';
  const cpu = '90';
  const disk = '3072';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/4gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '4gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '4048';
  const cpu = '110';
  const disk = '4048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/5gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '5gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '5048';
  const cpu = '140';
  const disk = '5048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/6gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '6gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '6048';
  const cpu = '170';
  const disk = '6048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

??  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/7gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '7gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '7048';
  const cpu = '200';
  const disk = '7048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/8gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '8gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '8048';
  const cpu = '230';
  const disk = '8048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/9gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '9gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '9048';
  const cpu = '260';
  const disk = '9048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/10gbv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '10gb';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '10000';
  const cpu = '290';
  const disk = '10000';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/unliv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + 'unlimited';
  const email = `${username}@yamzzoffc.my.id`;
  const password = `${username}001`;

  const egg = setting.eggsv2;
  const loc = setting.locv2;
  const memo = '0';
  const cpu = '0';
  const disk = '0';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domainv2}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co.com/BKnXLYLf/20251104-140428.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domainv2}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

  // ─── /listserver ────────────────────
bot.onText(/\/listsrv/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;   
// Check if the user is the Owner
    const adminUsers = JSON.parse(fs.readFileSync(adminfile));
    const isAdmin = adminUsers.includes(String(msg.from.id));   
    if (!isAdmin) {
        bot.sendMessage(chatId, 'Perintah Hanya Untuk Owner, Hubungi Admin Saya Untuk Menjadi Owner atau Users Premium...', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }
                    ]
                ]
            }
        });
        return;
    }
    let page = 1; // Mengubah penggunaan args[0] yang tidak didefinisikan sebelumnya
    try {
        let f = await fetch(`${domainv2}/api/application/servers?page=${page}`, { // Menggunakan backticks untuk string literal
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pltav2}`
            }
        });
        let res = await f.json();
        let servers = res.data;
        let messageText = "Daftar server aktif yang dimiliki:\n\n";
        for (let server of servers) {
            let s = server.attributes;

            let f3 = await fetch(`${domainv2}/api/client/servers/${s.uuid.split('-')[0]}/resources`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pltcv2}`
                }
            });
            let data = await f3.json();
            let status = data.attributes ? data.attributes.current_state : s.status;

            messageText += `ID Server: ${s.id}\n`;
            messageText += `Nama Server: ${s.name}\n`;
            messageText += `Status: ${status}\n\n`;
        }

        bot.sendMessage(chatId, messageText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Terjadi kesalahan dalam memproses permintaan.');
    }
});

  // ─── /clearserver ────────────────────
bot.onText(/^\/clearsrv (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Validasi premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(userId));
  if (!isPremium) {
    return bot.sendMessage(chatId, '❌ Fitur ini hanya untuk pengguna premium.');
  }

  const excludedIds = match[1]
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  bot.sendMessage(chatId, `⛔ ID yang dilewati: ${excludedIds.join(', ')}`);

  try {
    const response = await fetch(`${domainv2}/api/application/servers`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pltav2}`,
      },
    });

    const res = await response.json();
    const servers = res.data;

    if (!servers || servers.length === 0) {
      return bot.sendMessage(chatId, '⚠️ Tidak ada server yang ditemukan.');
    }

    for (const server of servers) {
      const serverId = String(server.attributes.id);

      if (excludedIds.includes(serverId)) {
        await bot.sendMessage(chatId, `➡️ Lewati server ID: ${serverId}`);
        continue;
      }

      const deleteRes = await fetch(`${domainv2}/api/application/servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pltcv2}`,
        },
      });

      if (deleteRes.ok) {
        await bot.sendMessage(chatId, `✅ Berhasil hapus server: ${serverId}`);
      } else {
        const errText = await deleteRes.text();
        await bot.sendMessage(chatId, `❌ Gagal hapus server ID: ${serverId}\n${errText}`);
      }
    }

    await bot.sendMessage(chatId, '✔️ Proses penghapusan selesai.');
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${err.message}`);
  }
});

  // ─── /listuser ────────────────────
bot.onText(/\/listusr/, async (msg) => {
  const chatId = msg.chat.id;
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));
  if (!isPremium) {
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });
    return;
  }

  try {
    const response = await fetch(`${domainv2}/api/application/users`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${pltav2}`
      }
    });

    const json = await response.json();
    const users = json.data;
    if (!users || users.length === 0) return bot.sendMessage(chatId, "Tidak ada user yang terdaftar di panel.");

    let teks = `📋 *List User Panel:*\n\n`;
    for (let i of users) {
      const { id, username, root_admin, first_name } = i.attributes;
      const adminStatus = root_admin ? "⭐" : "❌";
      teks += `🆔 *${id}* - *${username}*\n👤 ${first_name} ${adminStatus}\n\n`;
    }

    bot.sendMessage(chatId, teks, { parse_mode: "Markdown" });
  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "Gagal mengambil data user panel.");
  }
});

  // ─── /clearuser ────────────────────
bot.onText(/\/clearusr/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Cek apakah yang akses owner
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  const isAdmin = adminUsers.includes(String(userId));

  if (!isAdmin) {
    return bot.sendMessage(chatId, 'Perintah ini hanya untuk Owner.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Hubungi Admin', url: 'https://t.me/yamzzzx' }]]
      }
    });
  }

  try {
    const res = await fetch(`${domainv2}/api/application/users`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pltav2}`
      }
    });

    const data = await res.json();
    const users = data.data;

    if (!users || users.length < 1) {
      return bot.sendMessage(chatId, "Tidak ada user yang ditemukan.");
    }

    let deleted = 0;
    for (const user of users) {
      const { id, username, root_admin } = user.attributes;
      if (root_admin === true) continue; // Lewati jika admin

      const del = await fetch(`${domainv2}/api/application/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pltav2}`
        }
      });

      if (del.ok) {
        deleted++;
        await bot.sendMessage(chatId, `✅ Berhasil hapus user: ${username} (ID: ${id})`);
      } else {
        const err = await del.text();
        await bot.sendMessage(chatId, `❌ Gagal hapus user ID: ${id} - ${err}`);
      }
    }

    if (deleted === 0) {
      bot.sendMessage(chatId, "Tidak ada user yang berhasil dihapus.");
    } else {
      bot.sendMessage(chatId, `Selesai menghapus ${deleted} user yang bukan admin.`);
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `Terjadi kesalahan: ${err.message}`);
  }
});

  // ─── /installprotect1 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect1 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
     const senderId = msg.from.id;

    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect1.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect2 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect2 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;
    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect2.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 2...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect3 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect3 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }
    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect3.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 3...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect4 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect4 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect4.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 4...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect5 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect5 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect5.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 5...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect6 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect6 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect6.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 6...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect7 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect7 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect7.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 7...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect8 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect8 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect8.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 8...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect9 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect9 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/installprotect9.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 9...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
// ─── /installprotectall (versi SSH2) ────────────────────
bot.onText(/^\/installprotectall (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const senderId = msg.from.id;
  const input = match[1];

  // Validasi premium
  if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

  // Validasi format input
  if (!input.includes('|')) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const [ipvps, pwvps] = input.split('|').map(i => i.trim());
  if (!ipvps || !pwvps) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const conn = new Client();
  const scripts = [
    'installprotect1.sh',
    'installprotect2.sh',
    'installprotect3.sh',
    'installprotect4.sh',
    'installprotect5.sh',
    'installprotect6.sh',
    'installprotect7.sh',
    'installprotect8.sh',
    'installprotect9.sh'
  ];

  bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 1-9...`, { parse_mode: 'Markdown' });

  conn.on('ready', async () => {
    bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi semua Protect Panel sedang berjalan...');

    for (let i = 0; i < scripts.length; i++) {
      const scriptURL = `https://raw.githubusercontent.com/yamzzreal/installprotectpanel/main/${scripts[i]}`;
      bot.sendMessage(chatId, `🚀 Memulai instalasi *${scripts[i]}*...`, { parse_mode: 'Markdown' });

      await new Promise((resolve) => {
        conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
          if (err) {
            bot.sendMessage(chatId, `❌ Gagal mengeksekusi ${scripts[i]}:\n\`${err.message}\``, { parse_mode: 'Markdown' });
            return resolve();
          }

          let output = '';

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            output += `\n[ERROR] ${data.toString()}`;
          });

          stream.on('close', () => {
            const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
            bot.sendMessage(chatId, `✅ *${scripts[i]} selesai!*\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, { parse_mode: 'Markdown' });
            resolve();
          });
        });
      });
    }

    conn.end();
    bot.sendMessage(chatId, '🎉 Semua instalasi Protect Panel 1-9 selesai!', { parse_mode: 'Markdown' });
  });

  conn.on('error', (err) => {
    bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, { parse_mode: 'Markdown' });
  });

  conn.connect({
    host: ipvps,
    port: 22,
    username: 'root',
    password: pwvps
  });
 });
  // ─── /uninstallprotect1 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect1 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect1.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 1 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 1 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect2 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect2 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect2.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai uninstall Protect 2 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 2 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect3 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect3 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect3.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 3 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 3 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect4 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect4 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect4.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 4 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 4 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect5 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect5 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect5.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 5 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 5 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect6 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect6 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect6.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 6 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 6 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect7 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect7 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect7.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 7 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 7 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect8 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect8 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect8.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 8 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 8 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect9 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect9 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect9.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 9 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 9 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
// ─── /uninstallprotectall (versi SSH2) ────────────────────
bot.onText(/^\/uninstallprotectall (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const input = match[1];

  // Validasi premium
  if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

  // Validasi format input
  if (!input.includes('|')) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const [ipvps, pwvps] = input.split('|').map(i => i.trim());
  if (!ipvps || !pwvps) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const conn = new Client();
  const scripts = [
    'uninstallprotect1.sh',
    'uninstallprotect2.sh',
    'uninstallprotect3.sh',
    'uninstallprotect4.sh',
    'uninstallprotect5.sh',
    'uninstallprotect6.sh',
    'uninstallprotect7.sh',
    'uninstallprotect8.sh',
    'uninstallprotect9.sh'
  ];

  bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect Panel 1-9...`, { parse_mode: 'Markdown' });

  conn.on('ready', async () => {
    bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses uninstall semua Protect Panel sedang berjalan...');

    for (let i = 0; i < scripts.length; i++) {
      const scriptURL = `https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/${scripts[i]}`;
      bot.sendMessage(chatId, `🚀 Memulai uninstall *${scripts[i]}*...`, { parse_mode: 'Markdown' });

      await new Promise((resolve) => {
        conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
          if (err) {
            bot.sendMessage(chatId, `❌ Gagal mengeksekusi ${scripts[i]}:\n\`${err.message}\``, { parse_mode: 'Markdown' });
            return resolve();
          }

          let output = '';

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            output += `\n[ERROR] ${data.toString()}`;
          });

          stream.on('close', () => {
            const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
            bot.sendMessage(chatId, `✅ *${scripts[i]} selesai!*\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, { parse_mode: 'Markdown' });
            resolve();
          });
        });
      });
    }

    conn.end();
    bot.sendMessage(chatId, '🎉 Semua uninstall Protect Panel 1-9 selesai!', { parse_mode: 'Markdown' });
  });

  conn.on('error', (err) => {
    bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, { parse_mode: 'Markdown' });
  });

  conn.connect({
    host: ipvps,
    port: 22,
    username: 'root',
    password: pwvps
  });
 });
}

app.listen(port, () => {
  console.log(`🚀 Server aktif di ${url}:${port}`);
});
module.exports = { setBotInstance };
