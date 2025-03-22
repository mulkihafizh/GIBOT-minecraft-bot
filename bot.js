const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalFollow, GoalBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.get('/', (req, res) => {
  res.send('Bot has arrived');
});
app.listen(8000, () => {
  console.log('Server started');
});

const clientDiscord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
clientDiscord.login(config.discord.token);

// Override console.log
const originalLog = console.log;
console.log = (...args) => {
  const logMessage = args.join(' ');
  if (clientDiscord && config.discord.channel_id) {
    const channel = clientDiscord.channels.cache.get(config.discord.channel_id);
    if (channel) {
      channel.send('```' + logMessage + '```').catch(err => originalLog('Discord log error:', err));
    }
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

    const block = bot.findBlock({
      matching: diamondId,
      maxDistance: 32,
    });

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

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    const msg = message.toLowerCase();

    if (msg.includes('diam')) {
      isWandering = false;
      bot.pathfinder.setGoal(null);
      bot.chat('Baik! Aku akan diam di sini.');
    } else if (msg.includes('jalan') || msg.includes('lanjut')) {
      if (!isWandering) {
        isWandering = true;
        bot.chat('Oke! Aku akan jalan-jalan lagi.');
        wanderAround();
      }
    } else if (msg.includes('ikut aku') || msg.includes('follow me')) {
      const target = bot.players[username]?.entity;
      if (target) {
        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(new GoalFollow(target, 1));
        bot.chat(`Oke ${username}, aku ikut kamu! 🚶‍♂️`);
      }
    } else if (msg.includes('cari diamond')) {
      locateDiamonds();
    } else if (msg.includes('halo') || msg.includes('hi')) {
      bot.chat(`Halo ${username}! Lagi ngapain?`);
    } else if (msg.includes('bot')) {
      bot.chat(`Ye, naon emang`);
    } else if (msg.includes('siapa')) {
      bot.chat(`cuman bot, gausa ganggu`);
    } else if (msg.includes('main') || msg.includes('ayo')) {
      bot.chat(`gamawu`);
    } else if (msg.includes('help')) {
      bot.chat(`cape si giffa edit codingannya, gabisa help, mikir sendiri aja`);
    } else if (msg.includes('off') || msg.includes('matikan')) {
      autoMineEnabled = false;
      bot.chat('Oke, auto-search dimatikan.');
    } else if (msg.includes('on') || msg.includes('nyalakan')) {
      autoMineEnabled = true;
      bot.chat('Oke, auto-search dinyalakan lagi.');
    }
  });

  bot.on('goal_reached', () => {
    console.log(`[WanderBot] Sampai di tujuan ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log('[WanderBot] Bot has died. Respawned.');
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      const baseDelay = config.utils['auto-reconnect-delay'] || 30000;
      const randomDelay = Math.floor(Math.random() * 15000);
      const totalDelay = baseDelay + randomDelay;

      console.log(`[AutoReconnect] Bot akan mencoba reconnect dalam ${totalDelay / 1000} detik`);
      setTimeout(() => {
        createBot();
      }, totalDelay);
    });
  }

  bot.on('kicked', reason => {
    console.log(`[WanderBot] Kicked from server. Reason: \n${reason}`);
  });

  bot.on('error', err => {
    console.log(`[ERROR] ${err.message}`);
  });

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully registered') || message.includes('already registered')) resolve();
        else reject(`Registration failed: ${message}`);
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully logged in')) resolve();
        else reject(`Login failed: ${message}`);
      });
    });
  }
}

createBot();