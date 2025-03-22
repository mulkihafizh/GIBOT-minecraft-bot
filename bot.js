const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalFollow, GoalBlock } } = require('mineflayer-pathfinder');
const axios = require('axios');
const config = require('./settings.json');
const express = require('express');

const app = express();
app.get('/', (req, res) => {
  res.send('Bot has arrived');
});
app.listen(8000, () => {
  console.log('Server started');
});

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

  async function sendWebhookReport(message) {
    try {
      await axios.post(config.utils.webhook_url, {
        content: message
      });
      console.log('[Webhook] Laporan throttling terkirim');
    } catch (err) {
      console.error('[Webhook Error]', err.message);
    }
  }

  bot.once('spawn', () => {
    console.log('\x1b[33m[WanderBot] Bot joined the server\x1b[0m');
    bot.pathfinder.setMovements(defaultMove);

    if (config.position.enabled) {
      bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    } else {
      setTimeout(() => wanderAround(), 10000);
    }

    startAntiAfk();
  });

  bot.on('kicked', reason => {
    const reasonStr = reason?.toString() || 'Unknown';
    console.log(`\x1b[33m[WanderBot] Kicked from server. Reason: ${reasonStr}\x1b[0m`);

    if (reasonStr.includes('Connection throttled')) {
      sendWebhookReport(`⚠️ Bot di-kick karena throttling di server ${config.server.ip}:${config.server.port}`);
    }
  });

  bot.on('end', () => {
    const baseDelay = config.utils['auto-reconnect-delay'] || 30000;
    const randomDelay = Math.floor(Math.random() * 15000); // random tambahan 0-15 detik
    const totalDelay = baseDelay + randomDelay;

    console.log(`[AutoReconnect] Bot akan mencoba reconnect dalam ${totalDelay / 1000} detik`);
    setTimeout(() => {
      createBot();
    }, totalDelay);
  });

  bot.on('error', err => {
    console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m');
  });
}

createBot();
