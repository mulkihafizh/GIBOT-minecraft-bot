const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalFollow, GoalBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Web server
const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('[Express] Server started on port 8000'));

// Discord Client
const clientDiscord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let discordChannel;
clientDiscord.once('ready', () => {
  console.log(`[Discord] Bot Discord siap sebagai ${clientDiscord.user.tag}`);

  discordChannel = clientDiscord.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
  if (!discordChannel) {
    originalLog('Channel ID tidak ditemukan. Pastikan ID channel sudah benar.');
  } else {
    originalLog('Channel Discord ditemukan, siap kirim log.');
  }
});
clientDiscord.login(process.env.DISCORD_TOKEN);

// Override console.log
const originalLog = console.log;
console.log = (...args) => {
  const logMessage = args.join(' ');
  if (discordChannel) {
    discordChannel.send('```' + logMessage + '```').catch(err => originalLog('Discord log error:', err));
  }
  originalLog(...args);
};

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);

  let isWandering = true;
  let autoMineEnabled = config.utils['auto-mine']?.enabled || false;

  function wanderAround() {
    if (!isWandering) return;
    const radius = 10 + Math.floor(Math.random() * 5);
    const angle = Math.random() * 2 * Math.PI;
    const x = bot.entity.position.x + Math.floor(Math.cos(angle) * radius);
    const z = bot.entity.position.z + Math.floor(Math.sin(angle) * radius);
    const y = bot.entity.position.y;

    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new GoalBlock(x, y, z));

    const delay = 5 + Math.floor(Math.random() * 3); // Delay 5-7 detik
    console.log(`[WanderBot] Jalan ke (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) dalam radius ${radius} blok. Delay ${delay} detik`);


    setTimeout(() => {
      if (isWandering && !bot.pathfinder.isMoving()) wanderAround();
    }, delay * 1000);
  }

  function startAntiAfk() {
    if (config.utils['anti-afk'].enabled) {
      setInterval(() => {
        const radius = 3 + Math.floor(Math.random() * 3);
        const angle = Math.random() * 2 * Math.PI;
        const x = bot.entity.position.x + Math.floor(Math.cos(angle) * radius);
        const z = bot.entity.position.z + Math.floor(Math.sin(angle) * radius);
        const y = bot.entity.position.y;

        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(new GoalBlock(x, y, z));
        console.log(`[AntiAFKBot] Bergerak ke (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
      }, config.utils['anti-afk'].interval * 1000 || 60000);

      setInterval(() => {
        bot.swingArm('right');
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
        console.log('[AntiKick] Swing arm + lompat agar tidak dianggap AFK oleh server');
      }, (config.utils['anti-afk'].interval * 1000 || 60000) * 3);
    }
  }

  async function locateDiamonds() {
    if (!autoMineEnabled) return;
    const diamondId = mcData.blocksByName['diamond_ore'].id;
    bot.chat('Mencari diamond...');

    const block = bot.findBlock({ matching: diamondId, maxDistance: 32 });

    if (block) {
      bot.chat(`WEH ADA NIH DIAMOND : (${block.position.x}, ${block.position.y}, ${block.position.z})!`);
      bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
    } else {
      bot.chat('Tidak ada diamond di sekitar.');
    }
  }

  bot.once('spawn', () => {
    console.log('[WanderBot] Bot joined the server');
    bot.pathfinder.setMovements(defaultMove);

    if (config.position.enabled) {
      bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    } else {
      setTimeout(() => wanderAround(), 10000);
    }

    startAntiAfk();

    if (config['anti-lag'] && config['anti-lag'].enabled) {
      console.log('[INFO] Anti-Lag module started');
      setInterval(() => {
        const drops = Object.values(bot.entities).filter(e => e.name === 'item');
        const radius = config['anti-lag'].clear_radius;
        if (drops.some(drop => bot.entity.position.distanceTo(drop.position) <= radius)) {
          bot.chat(`/kill @e[type=item,distance=..${radius}]`);
          console.log(`[AntiLagBot] Cleared dropped items within ${radius} blocks.`);
        }
      }, config['anti-lag'].clear_interval * 1000);
    }

    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      sendRegister(password).then(() => sendLogin(password)).catch(console.error);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      const delay = config.utils['chat-messages']['repeat-delay'] * 1000;
      let i = 0;

      setInterval(() => {
        bot.chat(`${messages[i]}`);
        i = (i + 1) % messages.length;
      }, delay);
    }
  });

  // Chat Handler dan lainnya tetap sama

  // Global try-catch untuk event yang sering error
  bot.on('physicsTick', () => {
    try {
      if (bot.entity && bot.entity.position) {
        // Aman
      }
    } catch (err) {
      console.log(`[SafePhysics] Error di physicsTick: ${err.message}`);
    }
  });

  bot.on('entityAttach', (entity, vehicle) => {
    try {
      if (vehicle && vehicle.passengers) {
        vehicle.passengers.push(entity);
      }
    } catch (err) {
      console.log(`[SafeAttach] Error saat attach entitas: ${err.message}`);
    }
  });

  bot.on('entityDetach', (entity, vehicle) => {
    try {
      if (vehicle && vehicle.passengers) {
        const index = vehicle.passengers.indexOf(entity);
        if (index !== -1) vehicle.passengers.splice(index, 1);
      }
    } catch (err) {
      console.log(`[SafeDetach] Error saat detach entitas: ${err.message}`);
    }
  });

  // Auto Reconnect
  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      const baseDelay = config.utils['auto-reconnect-delay'] || 30000;
      const randomDelay = Math.floor(Math.random() * 15000);
      const totalDelay = baseDelay + randomDelay;
      console.log(`[AutoReconnect] Bot akan mencoba reconnect dalam ${totalDelay / 1000} detik`);
      setTimeout(() => createBot(), totalDelay);
    });
  }

  // Auto-register/login function tetap
}

createBot();

// Global error handler
// Global Error Handling
process.on('uncaughtException', (err) => {
  console.log(`[Global Error] Uncaught Exception: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('[Global Error] Unhandled Rejection at:', promise, 'reason:', reason);
});
