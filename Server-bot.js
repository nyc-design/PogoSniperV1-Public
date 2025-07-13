/*****************************************************************
 *  Pogo “Reveal” self-bot
 *****************************************************************/
const { Client } = require('discord.js-selfbot-v13');
const fetch      = require('node-fetch');
require('dotenv').config();


// --- CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
 
const NTFY_TOPIC = process.env.NTFY_TOKEN; // Replace with your ntfy topic
const TARGET_SERVER_ID = '864766766932426772';
const TARGET_CHANNEL_ID = '991971480122437642';
const TARGET_BOT_ID = '1028276416523022387'; // The ID of the bot that posts the "Reveal" messages
// -----------------------------------------

const client = new Client({ checkUpdate: false });
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

/* ────────── helpers ────────── */
const coordsRx      = /(-?\d{1,3}(?:\.\d+)?)[\s,/]+(-?\d{1,3}(?:\.\d+)?)/;
const extractCoords = s => (s || '').match(coordsRx);

function flattenText(src = {}) {
  return [
    src.content,
    ...(src.embeds ?? []).flatMap(e => [
      e.title,
      e.description,
      e.footer?.text,
      e.author?.name,
      e.url,
      ...(e.fields ?? []).map(f => f.value)
    ]),
    ...(src.components ?? [])
      .flatMap(r => r.components)
      .flatMap(c => [               // NEW — scan every button/link
        c.url,
        c.custom_id,
        c.label
      ])
  ].filter(Boolean).join(' ');
}

/* ────────── ① click the button ───────── */
client.on('messageCreate', async msg => {
  if (
    msg.guild?.id !== TARGET_SERVER_ID ||
    msg.channel.id !== TARGET_CHANNEL_ID ||
    msg.author.id !== TARGET_BOT_ID ||
    !msg.components.length
  ) return;

  const reveal = msg.components
    .flatMap(r => r.components)
    .find(c => c.type === 'BUTTON' && c.label?.toLowerCase() === 'reveal');
  if (!reveal) return;

  console.log('[ACTION] Reveal button spotted');

  const quick = extractCoords(reveal.custom_id);
  if (quick) {
    return sendNotification(quick[0], quick[1], reveal.custom_id);
  }

  try { await msg.clickButton(reveal.custom_id); }
  catch (e) { console.error('click failed:', e); }
});

/* ────────── ② MESSAGE_CREATE (shell) ───────── */
client.ws.on('MESSAGE_CREATE', pkt => {
  if (pkt.channel_id !== TARGET_CHANNEL_ID) return;
  if ((pkt.flags & 64) === 0) return;               // must be EPHEMERAL

  const m = extractCoords(flattenText(pkt));
  if (m) sendNotification(m[1], m[2], flattenText(pkt));
});

/* ────────── ③ INTERACTION_CREATE (reply) ───────── */
client.ws.on('INTERACTION_CREATE', pkt => {
  const authorId = pkt?.member?.user?.id ?? pkt?.user?.id;
  if (authorId !== TARGET_BOT_ID || pkt.channel_id !== TARGET_CHANNEL_ID) return;

  const m = extractCoords(flattenText(pkt.data));
  if (m) sendNotification(m[1], m[2], flattenText(pkt.data));
});

/* ────────── ④ MESSAGE_UPDATE (edit w/ coords) ───────── */
client.ws.on('MESSAGE_UPDATE', pkt => {
  if (pkt.channel_id !== TARGET_CHANNEL_ID) return;

  // Ignore only when flags exist, are non-zero, and clearly non-ephemeral
  if (typeof pkt.flags === 'number' && pkt.flags !== 0 && (pkt.flags & 64) === 0)
    return;

  const m = extractCoords(flattenText(pkt));
  if (m) {
    console.log('[SUCCESS] coords (edit) →', m[1], m[2]);
    sendNotification(m[1], m[2], flattenText(pkt));
  }
});

/* ────────── ntfy push ───────── */
async function sendNotification(lat, lng, raw) {
  const mon   = (raw.match(/\*\*(\w+)\*\*/) || [])[1];
  const title = mon ? `${mon} Found!` : 'Coordinates Received!';
  const deep  = `itoolsbt://jumpLocation?lat=${lat}&lng=${lng}`;

  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method : 'POST',
      body   : `${lat},${lng}`,
      headers: {
        Title        : title,
        Priority     : 'high',
        Tags         : 'iphone,arrow_forward,white_check_mark',
        Click        : deep,
        'X-Deep-Link': 'true',
      },
    });
    console.log('✔  ntfy sent');
  } catch (e) {
    console.error('✘  ntfy failed:', e);
  }
}

/* ────────── go ───────── */
client.login(TOKEN);
console.log('Attempting to log in…');
process.stdin.resume();          // keep process alive
