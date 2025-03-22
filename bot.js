const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalFollow, GoalBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('[Express] Server started on port 8000'));

// Setup Discord Client
const clientDiscord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let discordReady = false;
let discordChannel = null;

clientDiscord.once('ready', () => {
  console.log(`[Discord] Logged in as ${clientDiscord.user.tag}`);
  discordChannel = clientDiscord.channels.cache.get(config.discord.channel_id);
  if (!discordChannel) {
    console.error('[Discord] Channel ID tidak ditemukan. Pastikan ID channel sudah benar.');
  } else {
    discordReady = true;
  }
});

clientDiscord.login(process.env.DISCORD_TOKEN);

// Override console.log agar masuk ke Discord juga
const originalLog = console.log;
console.log = (...args) => {
  const message = args.join(' ');
  originalLog(message);
  if (discordReady && discordChannel) {
    const cleanMessage = message.length > 1900 ? message.slice(0, 1900) + '...' : message;
    discordChannel.send('```' + cleanMessage + '```').catch(err => originalLog('[Discord Log Error]', err));
  }
};

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account'].username,
    password: config['bot-account'].password,
    auth: config['bot-account'].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);

  let isWandering = true;
  let autoMineEnabled = config.utils['auto-mine']?.enabled || false;

  // Anti-AFK + Wander + Auto-Mine (same as yours, dipendekkan)
  function wanderAround() {
    if (!isWandering) return;
    const radius = 10 + Math.floor(Math.random() * 5);
    const angle = Math.random() * 2 * Math.PI;
    const x = bot.entity.position.x + Math.floor(Math.cos(angle) * radius);
    const z = bot.entity.position.z + Math.floor(Math.sin(angle) * radius);
    const y = bot.entity.position.y;

    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new GoalBlock(x, y, z));

    const delay = 20 + Math.floor(Math.random() * 15);
    console.log(`[WanderBot] Jalan ke (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) dalam radius ${radius} blok. Delay ${delay} detik`);

    setTimeout(() => {
      if (isWandering && !bot.pathfinder.isMoving()) {
        wanderAround();
      }
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
        console.log(`[AntiAFK] Bergerak ke (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
      }, config.utils['anti-afk'].interval * 1000 || 60000);

      setInterval(() => {
        bot.swingArm('right');
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
        console.log('[AntiAFK] Swing arm + lompat untuk anti-kick');
      }, (config.utils['anti-afk'].interval * 1000 || 60000) * 3);
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
          console.log(`[AntiLag] Cleared items within ${radius} blocks.`);
        }
      }, config['anti-lag'].clear_interval * 1000);
    }
  });

  // Logging tambahan ke Discord
  bot.on('goal_reached', () => {
    console.log(`[WanderBot] Sampai di tujuan ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log('[WanderBot] Bot mati, respawn...');
  });

  bot.on('kicked', reason => {
    console.log(`[WanderBot] Bot ditendang. Reason: ${reason}`);
  });

  bot.on('error', err => {
    console.log(`[ERROR] ${err.message}`);
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      const baseDelay = config.utils['auto-reconnect-delay'] || 30000;
      const randomDelay = Math.floor(Math.random() * 15000);
      const totalDelay = baseDelay + randomDelay;
      console.log(`[AutoReconnect] Reconnect dalam ${totalDelay / 1000} detik`);
      setTimeout(() => createBot(), totalDelay);
    });
  }
}

createBot();
