/*****************************************************************
 *  Pogo “Reveal” self‑bot with geofence filter (updated)
 *****************************************************************/
const { Client } = require('discord.js-selfbot-v13');
const fetch      = require('node-fetch');
require('dotenv').config();

// ───── CONFIG ─────
const TOKEN             = process.env.DISCORD_TOKEN;
const NTFY_TOPIC        = process.env.NTFY_TOKEN;

const TARGET_SERVER_ID  = '864766766932426772';   // Target Server
const TARGET_CHANNEL_ID = '991714778936520785';   // Target Channel
const TARGET_BOT_ID     = '1028276416523022387';   // the “Reveal” bot

// ← geofence config from .env
//    GEOFENCE_CENTER=40.7128,-74.0060
//    GEOFENCE_RADIUS_KM=10 (0 to disable)
const GEOFENCE_CENTER = process.env.GEOFENCE_CENTER
  ? process.env.GEOFENCE_CENTER
      .split(',')
      .map(s => Number(s.trim()))
  : null;
// default to 0 if unset; zero disables the filter
const GEOFENCE_RADIUS_KM = process.env.GEOFENCE_RADIUS_KM
  ? Number(process.env.GEOFENCE_RADIUS_KM)
  : 0;

const client = new Client({ checkUpdate: false });
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ───── helpers ─────
const coordsRx = /(-?\d{1,3}\.\d+)[\s,/]+(-?\d{1,3}\.\d+)/;
function extractCoords(s) {
  return (s || '').match(coordsRx);
}

function haversineDistance([lat1, lon1], [lat2, lon2]) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
      .flatMap(c => [c.url, c.custom_id, c.label])
  ]
    .filter(Boolean)
    .join(' ');
}

// ───── ① ORIGINAL CLICK HANDLER ─────
async function handleMessageCreate(msg) {
  if (
    msg.guild?.id !== TARGET_SERVER_ID ||
    msg.channel.id !== TARGET_CHANNEL_ID
  ) return;

  const reveal = msg.components
    ?.flatMap(r => r.components)
    .find(
      c => c.type === 'BUTTON' &&
           c.label?.toLowerCase() === 'reveal'
    );
  if (!reveal) return;

  console.log('[ACTION] Reveal spotted');
  const quick = extractCoords(reveal.custom_id);
  if (quick) {
    // baked‑in coords
    return sendNotification(quick[1], quick[2], reveal.custom_id);
  }

  // trigger ephemeral reply
  try {
    await msg.clickButton(reveal.custom_id);
  } catch (e) {
    console.error('[ERROR] click failed:', e);
  }
}

// ───── ② WS HANDLERS TO CATCH THE EPHEMERAL ─────
function handleWsMessageCreate(pkt) {
  if (pkt.channel_id !== TARGET_CHANNEL_ID) return;
  if ((pkt.flags & 64) === 0) return; // only ephemeral

  const m = extractCoords(flattenText(pkt));
  if (m) sendNotification(m[1], m[2], flattenText(pkt));
}

function handleWsInteractionCreate(pkt) {
  const authorId = pkt?.member?.user?.id ?? pkt?.user?.id;
  if (
    authorId !== TARGET_BOT_ID ||
    pkt.channel_id !== TARGET_CHANNEL_ID
  ) return;

  const m = extractCoords(flattenText(pkt.data));
  if (m) sendNotification(m[1], m[2], flattenText(pkt.data));
}

function handleWsMessageUpdate(pkt) {
  if (pkt.channel_id !== TARGET_CHANNEL_ID) return;
  if (
    typeof pkt.flags === 'number' &&
    pkt.flags !== 0 &&
    (pkt.flags & 64) === 0
  ) return; // ignore non‑ephemeral edits

  const m = extractCoords(flattenText(pkt));
  if (m) {
    console.log('[SUCCESS] coords (edit) →', m[1], m[2]);
    sendNotification(m[1], m[2], flattenText(pkt));
  }
}

// ───── attach listeners ─────
client.on('messageCreate', handleMessageCreate);
client.ws.on('MESSAGE_CREATE', handleWsMessageCreate);
client.ws.on('INTERACTION_CREATE', handleWsInteractionCreate);
client.ws.on('MESSAGE_UPDATE', handleWsMessageUpdate);

// ───── ③ ntfy + geofence ─────
async function sendNotification(lat, lng, raw) {
  const latF = parseFloat(lat);
  const lngF = parseFloat(lng);

  // only apply filter when radius > 0
  if (GEOFENCE_CENTER && GEOFENCE_RADIUS_KM > 0) {
    const dist = haversineDistance(
      GEOFENCE_CENTER,
      [latF, lngF]
    );
    if (dist > GEOFENCE_RADIUS_KM) {
      console.log(
        `[FOUND] ${latF.toFixed(5)},${lngF.toFixed(5)} → ` +
        `Outside geofence (${dist.toFixed(2)} km > ${GEOFENCE_RADIUS_KM} km). ` +
        `Notification not sent.`
      );
      return;
    }
  }

  const mon   = (raw.match(/\*\*(\w+)\*\*/) || [])[1];
  const title = mon ? `${mon} Found!` : 'Coordinates Received!';
  const deep  = `itoolsbt://jumpLocation?lat=${latF}&lng=${lngF}`;

  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method : 'POST',
      body   : `${latF},${lngF}`,
      headers: {
        Title        : title,
        Priority     : 'high',
        Tags         : 'iphone,arrow_forward,white_check_mark',
        Click        : deep,
        'X-Deep-Link': 'true',
      },
    });
    console.log('✔ ntfy sent');
  } catch (e) {
    console.error('✘ ntfy failed:', e);
  }
}

// ───── start up ─────
client.login(TOKEN);
console.log('Attempting to log in…');
process.stdin.resume();
