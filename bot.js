const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalFollow, GoalBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');
const Vec3 = require('vec3');
const RPC = require('discord-rpc');


require('dotenv').config();
// const { Client, GatewayIntentBits } = require('discord.js');

// Web server
const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('[Express] Server started on port 8000'));

// Discord 
// rich presance
const clientId = process.env.DISCORD_CLIENT_ID; 
// const rpc = new RPC.Client({ transport: 'ipc' });
// // Presence info
// function setActivity() {
//   rpc.setActivity({
//     details: 'bot begoo',
//     state: 'Bot under development',
//     startTimestamp: 202322,
//     largeImageKey: 'embedded_background', 
//     largeImageText: 'Under development',
//     smallImageKey: 'embedded_cover',
//     buttons: [
//       { label: 'Join Discord', url: 'https://discord.gg/G9g9pT54sZ' }, 
//       { label: 'Lihat Project', url: 'https://github.com/GiffaIndr/GIBOT-minecraft-bot.git' }
//     ]
//   });
// }

// rpc.on('ready', () => {
//   setActivity();
//   console.log('[RichPresence] Discord Rich Presence aktif!');
// });

// rpc.login({ clientId }).catch(console.error);

// const clientDiscord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// let discordChannel;
// clientDiscord.once('ready', () => {
//   console.log(`[Discord] Bot Discord siap sebagai ${clientDiscord.user.tag}`);

//   discordChannel = clientDiscord.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
//   if (!discordChannel) {
//     originalLog('Channel ID tidak ditemukan. Pastikan ID channel sudah benar.');
//   } else {
//     originalLog('Channel Discord ditemukan, siap kirim log.');
//   }
// });
// clientDiscord.login(process.env.DISCORD_TOKEN);


// Override console.log
const originalLog = console.log;
console.log = (...args) => {
  const logMessage = args.join(' ');
  // if (discordChannel) {
  //   discordChannel.send('```' + logMessage + '```').catch(err => originalLog('Discord log error:', err));
  // }
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

  let guardEnabled = false;
  let isWandering = true;
  let autoMineEnabled = config.utils['auto-mine']?.enabled || false;

  function findNearestHostile(bot) {
    const mobs = bot.nearestEntity(entity => {
      return entity.type === 'mob' &&
             entity.position &&
             entity.mobType &&
             ['Zombie', 'Skeleton', 'Creeper', 'Spider', 'Enderman', 'Pillager'].includes(entity.mobType) &&
             bot.entity.position.distanceTo(entity.position) < 16;
    });
    return mobs;
  }

  function wanderAround() {
    if (!isWandering) return;
    const radius = 10 + Math.floor(Math.random() * 5);
    const angle = Math.random() * 2 * Math.PI;
    const x = bot.entity.position.x + Math.floor(Math.cos(angle) * radius);
    const z = bot.entity.position.z + Math.floor(Math.sin(angle) * radius);
    const y = bot.entity.position.y;

    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new GoalBlock(x, y, z));

    const delay = 5 + Math.floor(Math.random() * 3);
    console.log(`[WanderBot] Jalan ke (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) dalam radius ${radius} blok. Delay ${delay} detik`);

    setTimeout(() => {
      if (isWandering && !bot.pathfinder.isMoving()) wanderAround();
    }, delay * 1000);
  }
function startGuarding(bot) {
  const guardArea = bot.entity.position.clone(); // Misal guard di posisi saat ini
  bot.on('physicTick', () => {
    const mob = findNearestHostile(bot);
    if (mob) {
      bot.lookAt(mob.position.offset(0, mob.height, 0));
      bot.attack(mob);
    }
  });

  bot.chat('Mode guard diaktifkan.');
}
function startGuarding(bot) {
  const guardArea = bot.entity.position.clone(); // Misal guard di posisi saat ini
  bot.on('physicTick', () => {
    const mob = findNearestHostile(bot);
    if (mob) {
      bot.lookAt(mob.position.offset(0, mob.height, 0));
      bot.attack(mob);
    }
  });

  bot.chat('Mode guard diaktifkan.');
}
function stopGuarding(bot) {
  bot.removeAllListeners('physicTick');
  bot.chat('Mode guard dimatikan.');
}

function startTunnel(length) {
  const pos = bot.entity.position.clone();
  let blocksMined = 0;

  bot.on('blockUpdate', block => {
    if (blocksMined >= length) {
      bot.removeAllListeners('blockUpdate');
      bot.chat('🚧 Tunnel selesai.');
      return;
    }
  });

  async function digForward() {
    for (let i = 0; i < length; i++) {
      const forward = bot.entity.position.offset(1, 0, 0); // arah X+
      const block = bot.blockAt(forward);
      if (block && bot.canDigBlock(block)) {
        try {
          await bot.dig(block);
          blocksMined++;
        } catch (err) {
          bot.chat('⛔ Gagal gali block.');
        }
      }
      bot.setControlState('forward', true);
      await bot.waitForTicks(10);
      bot.setControlState('forward', false);
    }
    bot.chat('⛏️ Tunnel selesai.');
  }

  digForward();
}
function startChopTree() {
  const treeBlocks = bot.findBlocks({
    matching: block => block.name.includes('log'),
    maxDistance: 32,
    count: 1
  });

  if (!treeBlocks.length) {
    bot.chat('🌲 Tidak ada pohon terdekat.');
    return;
  }

  const treePos = treeBlocks[0];
  const block = bot.blockAt(treePos);

  bot.pathfinder.setGoal(new GoalBlock(treePos.x, treePos.y, treePos.z));
  bot.once('goal_reached', async () => {
    try {
      await bot.dig(block);
      bot.chat('🪓 Pohon ditebang.');

      // Auto-replant jika punya sapling
      const sapling = bot.inventory.items().find(item => item.name.includes('sapling'));
      if (sapling) {
        const dirtBlock = bot.blockAt(treePos);
        if (dirtBlock && dirtBlock.name === 'dirt') {
          await bot.placeBlock(dirtBlock, new Vec3(0, 1, 0));
          bot.chat('🌱 Replant berhasil.');
        }
      }
    } catch (err) {
      bot.chat('❌ Gagal tebang atau replant.');
    }
  });
};

  // clientDiscord.on('messageCreate', async (message) => {
  //   if (message.channel.id !== process.env.DISCORD_CHANNEL_ID || message.author.bot) return;

  //   const args = message.content.split(' ');
  //   const cmd = args.shift().toLowerCase();

  //   if (cmd === '.say') {
  //     const text = args.join(' ');
  //     bot.chat(text);
  //     return message.reply(`✅ Mengirim pesan: ${text}`);
  //   }

  //   if (cmd === '.locate' && args[0] === 'diamond') {
  //     locateDiamonds();
  //     return message.reply('🔍 Mencari diamond...');
  //   }

  //   if (cmd === '.start' && args[0] === 'wander') {
  //     isWandering = true;
  //     wanderAround();
  //     return message.reply('🟢 Bot mulai jalan-jalan');
  //   }

  //   if (cmd === '.stop' && args[0] === 'wander') {
  //     isWandering = false;
  //     bot.pathfinder.setGoal(null);
  //     return message.reply('🔴 Bot berhenti jalan-jalan');
  //   }

  //   let followInterval = null;

  //   if (cmd === '.follow' && args[0]) {
  //     const targetPlayerName = args[0];
  //     const targetPlayer = bot.players[targetPlayerName];
    
  //     if (targetPlayer && targetPlayer.entity) {
  //       bot.pathfinder.setMovements(defaultMove);
  //       bot.pathfinder.setGoal(new GoalFollow(targetPlayer.entity, 1));
  //       bot.chat(`Oke gw bakal ngikut ${targetPlayerName} ampe pegel`);
  //       message.reply(`👣 Mengikuti ${targetPlayerName} secara terus-menerus.`);
    
  //       // Clear existing interval
  //       if (followInterval) clearInterval(followInterval);
    
      
  //       followInterval = setInterval(() => {
  //         const target = bot.players[targetPlayerName]?.entity;
  //         if (target) {
  //           bot.pathfinder.setGoal(new GoalFollow(target, 1));
  //         } else {
  //           bot.chat(`⚠️ woe lu mana ${targetPlayerName}... jangan jauh jauh`);
  //         }
  //       }, 3000); // cek setiap 3 detik (bisa diubah)
    
  //     } else {
  //       return message.reply('⚠️ dah lah ganemu.');
  //     }
  //   }
    
  //   if (cmd === '.stop') {
  //     // Stop follow khusus
  //     if (args[0] === 'follow') {
  //       if (followInterval) {
  //         clearInterval(followInterval);
  //         followInterval = null;
  //       }
  //       bot.pathfinder.setGoal(null);
  //       bot.chat("dah gua berenti jngikutin lu");
  //       return message.reply('🛑 Bot berhenti mengikuti pemain.');
  //     } else {
  //       // Stop general activities
  //       if (followInterval) {
  //         clearInterval(followInterval);
  //         followInterval = null;
  //       }
  //       bot.pathfinder.setGoal(null);
  //       bot.chat("dah gua berenti jalan jalan");
  //       return message.reply('🛑 Bot berhenti dari aktivitasnya.');
  //     }
  //   }

  //   if (cmd === '.jump') {
  //     bot.setControlState('jump', true);
  //     setTimeout(() => bot.setControlState('jump', false), 500);
  //     return message.reply('⏫ Bot melompat');
  //   }

  //   if (cmd === '.kill' && args[0] === 'drops') {
  //     const radius = config['anti-lag']?.clear_radius || 10;
  //     bot.chat(`/kill @e[type=item,distance=..${radius}]`);
  //     return message.reply(`🧹 Membersihkan drop item di radius ${radius} blok`);
  //   }

  //   if (cmd === '.coords') {
  //     const pos = bot.entity.position;
  //     return message.reply(`📍 Koordinat Bot: X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`);
  //   }

  //   if (cmd === '.tp') {
  //     // Jika argumen hanya 1, berarti target player
  //     if (args.length === 1) {
  //         const targetName = args[0];
  //         const target = bot.players[targetName]?.entity;
  
  //         if (!target) {
  //             return message.reply(`❌ Player **${targetName}** tidak ditemukan disekitar chunk.`);
  //         }
  
  //         const pos = target.position;
  //         bot.pathfinder.setMovements(defaultMove);
  //         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
  
  //         return message.reply(`🛫 Bot menuju ke player **${targetName}** di X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`);
  //     }
  
  //     // Jika argumen ada 3, berarti target koordinat
  //     if (args.length === 3) {
  //         const [x, y, z] = args.map(Number);
  //         if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
  //             bot.pathfinder.setMovements(defaultMove);
  //             bot.pathfinder.setGoal(new GoalBlock(x, y, z));
  //             return message.reply(`🛫 Teleport ke X: ${x}, Y: ${y}, Z: ${z}`);
  //         } else {
  //             return message.reply('⚠️ Koordinat tidak valid.');
  //         }
  //     }
  
  //     return message.reply('⚠️ Format salah! Gunakan `.tp <playerName>` atau `.tp <x> <y> <z>`');
  // }
  

  //   if (cmd === '.guard' && (args[0] === 'on' || args[0] === 'off')) {
  //     guardEnabled = args[0] === 'on';
  //     if (guardEnabled) {
  //       bot.chat('Mode guard diaktifkan. Siap serang mobs hostile.');
  //       startGuarding(bot);
  //       return message.reply('🛡️ Mode guard ON.');
  //     } else {
  //       return message.reply('⚪ Mode guard OFF.');
  //     }
  //   }

  //   if (cmd === '.inventory') {
  //     const items = bot.inventory.items().map(item => `${item.name} x${item.count}`).join('\n') || 'Inventory kosong.';
  //     return message.reply(`🎒 Inventory Bot:\n\`\`\`${items}\`\`\``);
  //   }

  //   if (cmd === '.drop' && args.length >= 2) {
  //     const itemName = args[0];
  //     const amount = parseInt(args[1]);
  //     if (isNaN(amount) || amount <= 0) {
  //       return message.reply('⚠️ Jumlah harus berupa angka yang valid.');
  //     }
  //     const item = bot.inventory.items().find(i => i.name === itemName);
  //     if (item) {
  //       bot.toss(item.type, null, amount, err => {
  //         if (err) return message.reply('❌ Gagal drop item.');
  //         return message.reply(`📦 Drop ${amount} ${itemName}`);
  //       });
  //     } else {
  //       return message.reply('⚠️ Item tidak ditemukan di inventory.');
  //     }
  //   }

  //   if (cmd === '.eat') {
  //     const food = bot.inventory.items().find(item => item.name.includes('beef') || item.name.includes('bread') || item.name.includes('porkchop') || item.name.includes('apple'));
  //     if (food) {
  //       bot.equip(food, 'hand', () => {
  //         bot.consume();
  //         return message.reply(`🍽️ Makan ${food.name}`);
  //       });
  //     } else {
  //       return message.reply('⚠️ Tidak ada makanan di inventory.');
  //     }
  //   }

  //   if (cmd === '.health') {
  //     const hp = bot.health;
  //     const food = bot.food;
  //     return message.reply(`❤️ HP: ${hp.toFixed(1)}/20 | 🍗 Hunger: ${food}/20`);
  //   }

  //   if (cmd === '.tunnel' && args[0]) {
  //     const length = parseInt(args[0]);
  //     if (isNaN(length) || length <= 0) {
  //       return message.reply('⚠️ Panjang tunnel harus berupa angka.');
  //     }
  //     startTunnel(length);
  //     return message.reply(`⛏️ Mulai gali tunnel sepanjang ${length} blok.`);
  //   }

  //   if (cmd === '.chop' && args[0] === 'tree') {
  //     startChopTree();
  //     return message.reply('🌳 Mulai cari dan tebang pohon.');
  //   }

  //   if (cmd === '.status') {
  //     const pos = bot.entity.position;
  //     const nearestMob = findNearestHostile(bot);
  //     const mobInfo = nearestMob 
  //       ? `${nearestMob.mobType} di X:${nearestMob.position.x.toFixed(1)} Y:${nearestMob.position.y.toFixed(1)} Z:${nearestMob.position.z.toFixed(1)}`
  //       : 'Tidak ada mobs hostile terdekat.';
        
  //     const statusMsg = `
  //   🟢 Status Bot:
  //   - Wander: ${isWandering ? 'ON' : 'OFF'}
  //   - Guard: ${guardEnabled ? 'ON' : 'OFF'}
  //   - Auto-Mine: ${autoMineEnabled ? 'ON' : 'OFF'}
  //   - Lokasi: X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}
  //   - Mob Terdekat: ${mobInfo}
  //     `;        
  //     message.reply(statusMsg);
  //   }
    
  // });
  // ;
  

  // Anti AFK
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

  // Auto cari diamond
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
    console.log('GIBOT TELAH TIBAA');
    bot.chat('GIBOT DATANG DAWGGGGG')
    bot.pathfinder.setMovements(defaultMove);

    if (config.position.enabled) {
      bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    } else {
      setTimeout(() => wanderAround(), 10000);
    }

    startAntiAfk();

    // Anti-Lag
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

    // Auto-auth
    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      sendRegister(password).then(() => sendLogin(password)).catch(console.error);
    }

    // Auto chat
    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      const delay = config.utils['chat-messages']['repeat-delay'] * 1000;
      let i = 0;

      setInterval(() => {
        bot.chat(`${messages[i]}`);
        i = (i + 1) % messages.length;
      }, delay);
    }
    if (!bot.alive) return; 

  bot.chat('🔥 Gua hidup lagi bro, lanjut kelayapan...');
  });
  let followInterval = null;
  let discordClient = null;
bot.once('death', () => {
    if (followInterval) {
      clearInterval(followInterval);
      followInterval = null;
    }
    bot.pathfinder.setGoal(null);
    bot.chat('☠️ Gua mati bro... semua task gua stop dulu.');
    if (discordClient) {
      discordClient.channels.cache.get(config.discord.channel).send('☠️ Bot tewas! Semua aktivitas dihentikan.');
    }
});


    bot.once('death', () => {
      if (followInterval) {
        clearInterval(followInterval);
        followInterval = null;
      }
      bot.pathfinder.setGoal(null);
      bot.chat('☠️ Gua mati bro... semua task gua stop dulu.');
      if (discordClient) {
        discordClient.channels.cache.get(config.discord.channel).send('☠️ Bot tewas! Semua aktivitas dihentikan.');
      }
    });
  
  // Chat Handler
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
      bot.chat('Auto-mine dinonaktifkan.');
    } else if (msg.includes('on') || msg.includes('aktifkan')) {
      autoMineEnabled = true;
      bot.chat('Auto-mine diaktifkan.');
    }
  });

  function sendRegister(password) {
    return new Promise((resolve) => {
      bot.once('message', (jsonMsg) => {
        if (jsonMsg.toString().includes('/register')) {
          bot.chat(`/register ${password} ${password}`);
          resolve();
        } else {
          resolve();
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve) => {
      bot.once('message', (jsonMsg) => {
        if (jsonMsg.toString().includes('/login')) {
          bot.chat(`/login ${password}`);
          resolve();
        } else {
          resolve();
        }
      });
    });
  }

  bot.on('end', () => {
    console.log('[INFO] Bot terputus, mencoba reconnect dalam 10 detik...');
    setTimeout(() => createBot(), 10000);
  });

  bot.on('error', err => console.log('[ERROR]', err));
  bot._client.removeAllListeners('passengers');
bot._client.on('passengers', (packet) => {
  const vehicle = bot.entities[packet.vehicleId];
  if (!vehicle) {
    return;
  }
  vehicle.passengers = [];
  for (const id of packet.passengers) {
    const passengerEntity = bot.entities[id];
    if (passengerEntity) vehicle.passengers.push(passengerEntity);
  }
});

}

createBot();
