/*****************************************************************
 *  Pogo “Reveal” self‑bot with geofence filter (clean, stable build)
 *****************************************************************/

console.log("--- Script Start ---");

// ──────────────────────────────────────────────────────────────────────────────
// Imports & Setup
// ──────────────────────────────────────────────────────────────────────────────
const { Client } = require('discord.js-selfbot-v13');
const fetch      = require('node-fetch');
const express    = require('express');
require('dotenv').config();
const fs         = require('fs');
const fsp        = fs.promises;
const path       = require('path');
const { Writable } = require('stream');
const winston    = require('winston');

// ──────────────────────────────────────────────────────────────────────────────
// Log paths + in-memory buffer
// ──────────────────────────────────────────────────────────────────────────────
const LOG_PATH      = path.join(__dirname, 'bot.log');
const MAX_LOG_LINES = 1000;
const logBuffer     = [];

function pushLogLine(line) {
  if (!line) return;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
  }
}

try { fs.accessSync(LOG_PATH); } catch { fs.writeFileSync(LOG_PATH, ''); }

// ──────────────────────────────────────────────────────────────────────────────
// Logging
// ──────────────────────────────────────────────────────────────────────────────
const memoryStream = new Writable({ write(chunk, _enc, cb) { pushLogLine(chunk.toString().trim()); cb(); } });
const logger = winston.createLogger({ level: 'info', format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}] ${message}`)), transports: [ new winston.transports.Console(), new winston.transports.File({ filename: LOG_PATH, maxsize: 5_000_000, maxFiles: 5 }), new winston.transports.Stream({ stream: memoryStream }) ], exitOnError: false });
const logInfo  = (...a) => logger.info(a.join(' '));
const logWarn  = (...a) => logger.warn(a.join(' '));
const logError = (...a) => logger.error(a.join(' '));
['log','warn','error'].forEach(m => { const orig = console[m].bind(console); console[m] = (...args) => { orig(...args); const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); if (m === 'warn') logger.warn(msg); else if (m === 'error') logger.error(msg); else logger.info(msg); }; });

// ──────────────────────────────────────────────────────────────────────────────
// Env Vars & IDs
// ──────────────────────────────────────────────────────────────────────────────
const TOKEN      = process.env.DISCORD_TOKEN;
const NTFY_TOPIC = process.env.NTFY_TOKEN;
const FAIL_FAST  = /^true$/i.test(process.env.FAIL_FAST || '');

if (!TOKEN)      logWarn('[WARN] DISCORD_TOKEN missing; login will fail.');
if (!NTFY_TOPIC) logWarn('[WARN] NTFY_TOKEN missing; notifications disabled.');

let TARGET_SERVER_ID  = 'YOUR_SERVER_ID_HERE';
let TARGET_CHANNEL_ID = 'YOUR_CHANNEL_ID_HERE';
let TARGET_BOT_ID     = 'THE_POKEMON_BOT_ID_HERE';

// Queue of metadata for pending coordinate reveals
// Each item: { name, level, cp, ivPct, ivAtk, ivDef, ivSta, despawnEpoch }
const clickedPokemonQueue = [];

// Debug dump control (set env DEBUG_DUMP to a small number to capture more)
let DEBUG_DUMP_REMAINING = Number(process.env.DEBUG_DUMP ?? 0);

// ──────────────────────────────────────────────────────────────────────────────
// Geofence Config
// ──────────────────────────────────────────────────────────────────────────────
let GEOFENCE_CENTER = process.env.GEOFENCE_CENTER ? process.env.GEOFENCE_CENTER.split(',').map(s => Number(s.trim())) : null;
let GEOFENCE_RADIUS_KM = process.env.GEOFENCE_RADIUS_KM ? Number(process.env.GEOFENCE_RADIUS_KM) : 0;
const validateCoordPair = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n));

// ──────────────────────────────────────────────────────────────────────────────
// Express App & Discord Client
// ──────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); if (req.method === 'OPTIONS') return res.sendStatus(200); next(); });
const client = new Client({ checkUpdate: false });
client.once('ready', () => logInfo(`Logged in as ${client.user.tag}`));
client.on('error', err => logError('[CLIENT ERROR]', err.stack || err));
client.ws.on('error', err => logError('[WS ERROR]', err.stack || err));

// ──────────────────────────────────────────────────────────────────────────────
// Regex & Text Helpers
// ──────────────────────────────────────────────────────────────────────────────
const coordsRx = /(-?\d{1,3}\.\d+)[\s,\/]+(-?\d{1,3}\.\d+)/;
const pokemonBoldRx = /\*\*([A-Za-z0-9 .'\u2019♀♂:-]{1,40})\*\*/;
const stripAccents = (str = '') => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const canonName = (str = '') => stripAccents(String(str)).toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[^a-z0-9fm]/g, '');
function extractCoords(s) { return s && typeof s === 'string' ? s.match(coordsRx) : null; }

function extractPokemonNameSmart(text) {
  if (!text) return null;
  const boldMatch = text.match(pokemonBoldRx);
  if (boldMatch && boldMatch[1]) {
    const potentialName = boldMatch[1].trim();
    if (pokemonNameToIdMap.has(potentialName)) {
        return potentialName;
    }
  }
  const regexMatch = text.match(POKEMON_NAME_REGEX);
  if (regexMatch && regexMatch[1]) {
    return regexMatch[1].trim();
  }
  return null;
}

function flattenMessageLike(src = {}) { const out = []; if (src.author?.name) out.push(src.author.name); if (src.content) out.push(src.content); if (src.title) out.push(src.title); if (src.description) out.push(src.description); for (const e of (src.embeds || [])) { if (e.author?.name) out.push(e.author.name); if (e.title) out.push(e.title); if (e.description) out.push(e.description); if (e.footer?.text) out.push(e.footer.text); if (e.url) out.push(e.url); for (const f of (e.fields || [])) { if (f.name) out.push(f.name); if (f.value) out.push(f.value); } } for (const r of (src.components || [])) { for (const c of (r.components || [])) { if (c.url) out.push(c.url); if (c.custom_id) out.push(c.custom_id); if (c.label) out.push(c.label); } } return out.filter(Boolean).join(' '); }
function flattenGatewayPkt(pkt = {}) { const out = []; if (pkt.content) out.push(pkt.content); if (pkt.data) out.push(flattenMessageLike(pkt.data)); if (pkt.message) out.push(flattenMessageLike(pkt.message)); if (pkt.embeds) out.push(flattenMessageLike({ embeds: pkt.embeds })); return out.filter(Boolean).join(' '); }

// ──────────────────────────────────────────────────────────────────────────────
// Parsing helpers for stats and despawn from Discord messages
// ──────────────────────────────────────────────────────────────────────────────
const rxLevel    = /(?:\bL|\bLvl|\bLevel)\s*[: ]?\s*(\d{1,2})\b/i;
const rxCP       = /\bCP\s*[: ]?\s*(\d{2,5})\b/i;
// IV percentage must appear with an IV label nearby to avoid false positives
const rxIVpctA   = /\bIVs?\s*[: ]*([0-9]{1,3}(?:\.[0-9]+)?)%/i;      // e.g., "IV: 91%"
const rxIVpctB   = /([0-9]{1,3}(?:\.[0-9]+)?)%\s*IVs?\b/i;            // e.g., "91% IV"
const rxIVbreak  = /\((\d{1,2})\/(\d{1,2})\/(\d{1,2})\)/;
const rxDesAbs   = /(?:Despawn(?:s)?|Expire(?:s|d)?|Until|Time)\s*(?:at|:)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i;
const rxDesRel   = /\b(?:in|~)\s*(\d{1,3})\s*m(?:\s*(\d{1,2})\s*s)?\b/i;
// Emoji label variants from articuno-bot
const rxEmojiLv  = /<:Lv:\d+>\s*(\d{1,2})/i;
const rxEmojiCp  = /<:Cp:\d+>\s*(\d{2,5})/i;
const rxEmojiIv  = /<:Iv:\d+>\s*([0-9]{1,3}(?:\.[0-9]+)?)/i; // may lack % sign
// Countdown near name e.g. (05:02)
const rxTimerParen = /\((\d{1,2}):(\d{2})\)/;

function to2(n){ return String(n).padStart(2,'0'); }

function computeIvPct(a,b,c){
  if ([a,b,c].some(v => Number.isNaN(Number(v)))) return undefined;
  const s = Number(a)+Number(b)+Number(c);
  return Math.round((s/45)*1000)/10; // one decimal
}

function buildDespawnEpoch(createdMs, hh, mm, ss){
  const base = new Date(createdMs);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(hh)||0, Number(mm)||0, Number(ss)||0, 0);
  // If already past for today, assume next day (rare but safe)
  if (d.getTime() < createdMs - 30*1000) d.setDate(d.getDate()+1);
  return d.getTime();
}

function parseMessageForStats(text, createdMs, name){
  let level;
  const lm = text.match(rxLevel) || text.match(rxEmojiLv);
  if (lm) level = Number(lm[1]);

  let cp;
  const cm = text.match(rxCP) || text.match(rxEmojiCp);
  if (cm) cp = Number(cm[1]);

  let pct;
  const pmA = text.match(rxIVpctA); const pmB = text.match(rxIVpctB); const pmE = text.match(rxEmojiIv);
  if (pmA) pct = Number(pmA[1]);
  else if (pmB) pct = Number(pmB[1]);
  else if (pmE) pct = Number(pmE[1]);
  const brk   = text.match(rxIVbreak);
  const ivAtk = brk ? Number(brk[1]) : undefined;
  const ivDef = brk ? Number(brk[2]) : undefined;
  const ivSta = brk ? Number(brk[3]) : undefined;
  const ivPct = pct ?? computeIvPct(ivAtk, ivDef, ivSta);

  // Despawn
  let despawnEpoch;
  const abs = text.match(rxDesAbs);
  if (abs) {
    despawnEpoch = buildDespawnEpoch(createdMs, abs[1], abs[2], abs[3]||0);
  } else {
    const paren = text.match(rxTimerParen);
    if (paren) {
      const m = Number(paren[1])||0; const s = Number(paren[2])||0;
      despawnEpoch = createdMs + m*60*1000 + s*1000;
    } else {
      const rel = text.match(rxDesRel);
      if (rel) {
        const m = Number(rel[1])||0; const s = Number(rel[2]||0);
        despawnEpoch = createdMs + m*60*1000 + s*1000;
      }
    }
  }
  return { name, level, cp, ivPct, ivAtk, ivDef, ivSta, despawnEpoch };
}

function formatDespawn(despawnEpoch){
  if (!despawnEpoch) return null;
  const now = Date.now();
  const ms = Math.max(0, despawnEpoch - now);
  const m = Math.floor(ms/60000); const s = Math.round((ms%60000)/1000);
  const t = new Date(despawnEpoch);
  const hhmm = `${to2(t.getHours())}:${to2(t.getMinutes())}`;
  return `Despawns in ${m}m${s?` ${s}s`:''} (${hhmm})`;
}

// Replace characters that are illegal in HTTP header values
function sanitizeHeaderValue(str = '') {
  // Replace common non-ASCII separators with ASCII equivalents
  let s = String(str)
    .replace(/[•·]/g, '|')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, "'");
  // Drop all other non-ASCII to keep Node http happy
  s = s.replace(/[\u0100-\uFFFF]/g, '');
  // Remove CR/LF and control chars
  s = s.replace(/[\r\n\t]/g, ' ');
  return s.trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Lightweight debug dump helpers (sanitized)
// ──────────────────────────────────────────────────────────────────────────────
function toPlainMessage(msg = {}) {
  return {
    createdTimestamp: msg.createdTimestamp ?? Date.now(),
    content: msg.content ?? null,
    author: msg.author ? { id: msg.author.id, username: msg.author.username } : null,
    embeds: Array.isArray(msg.embeds) ? msg.embeds.map(e => ({
      title: e.title ?? null,
      description: e.description ?? null,
      fields: Array.isArray(e.fields) ? e.fields.map(f => ({ name: f.name, value: f.value })) : null,
      footer: e.footer?.text ?? null
    })) : null,
    components: Array.isArray(msg.components) ? msg.components.map(r => ({
      components: Array.isArray(r.components) ? r.components.map(c => ({ type: c.type, label: c.label, customId: c.customId, url: c.url })) : null
    })) : null
  };
}

function toPlainUpdate(pkt = {}) {
  return {
    content: pkt.content ?? null,
    data: pkt.data ? toPlainMessage(pkt.data) : null,
    embeds: Array.isArray(pkt.embeds) ? pkt.embeds.map(e => ({ title: e.title, description: e.description })) : null
  };
}

async function dump(label, obj) {
  try {
    if (DEBUG_DUMP_REMAINING <= 0) return;
    DEBUG_DUMP_REMAINING -= 1;
    const dir = path.join(__dirname, 'debug-samples');
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${label}-${Date.now()}.json`);
    await fsp.writeFile(file, JSON.stringify(obj, null, 2));
    logInfo(`[DEBUG] Wrote ${file}`);
  } catch (err) {
    logWarn('[DEBUG] dump failed:', err?.message || err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Settings Management
// ──────────────────────────────────────────────────────────────────────────────
const POKEMON_FILTER_FILE = path.join(__dirname, 'pokemon_filter.json');
let pokemonFilterCache = [];
let pokemonFilterCanon = new Set();
const DISCORD_IDS_FILE = path.join(__dirname, 'discord_ids.json');
function rebuildPokemonFilterCanon() { pokemonFilterCanon = new Set(pokemonFilterCache.map(canonName)); }
async function readPokemonFilter() { try { const data = await fsp.readFile(POKEMON_FILTER_FILE, 'utf8'); pokemonFilterCache = JSON.parse(data); if (!Array.isArray(pokemonFilterCache)) pokemonFilterCache = []; logInfo('[INFO] Pokémon filter loaded. Count:', pokemonFilterCache.length); } catch (err) { pokemonFilterCache = []; if (err.code !== 'ENOENT') logError('[ERROR] Failed to read Pokémon filter file:', err); else logInfo('[INFO] pokemon_filter.json not found. Starting with empty filter.'); } rebuildPokemonFilterCanon(); }
async function writePokemonFilter(list) { try { await fsp.writeFile(POKEMON_FILTER_FILE, JSON.stringify(list, null, 2)); pokemonFilterCache = list.slice(); rebuildPokemonFilterCanon(); logInfo('[API] Pokémon filter saved. Count:', pokemonFilterCache.length); return true; } catch (err) { logError('[API] Failed to save Pokémon filter:', err); return false; } }
async function loadDiscordIds() {
  try {
    const data = await fsp.readFile(DISCORD_IDS_FILE, 'utf8');
    const ids = JSON.parse(data);
    if (ids.serverId) TARGET_SERVER_ID = ids.serverId;
    if (ids.channelId) TARGET_CHANNEL_ID = ids.channelId;
    if (ids.botId) TARGET_BOT_ID = ids.botId;
    logInfo(`[INFO] Discord IDs loaded: Server=${TARGET_SERVER_ID}, Channel=${TARGET_CHANNEL_ID}, Bot=${TARGET_BOT_ID}`);
  } catch (err) {
    if (err.code === 'ENOENT') logWarn('[WARN] discord_ids.json not found. Please update IDs in the UI.');
    else logError('[ERROR] Failed to read Discord IDs file:', err);
  }
}
async function writeDiscordIds(ids) {
  try {
    await fsp.writeFile(DISCORD_IDS_FILE, JSON.stringify(ids, null, 2));
    TARGET_SERVER_ID = ids.serverId;
    TARGET_CHANNEL_ID = ids.channelId;
    TARGET_BOT_ID = ids.botId;
    logInfo('[API] Discord IDs saved successfully.');
    return true;
  } catch (err) {
    logError('[API] Failed to save Discord IDs:', err);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pokédex Data
// ──────────────────────────────────────────────────────────────────────────────
const POKEDEX_PATH = path.join(__dirname, 'data', 'pokedex.json');
function loadPokedexData() { try { const data = JSON.parse(fs.readFileSync(POKEDEX_PATH, 'utf8')); if (!Array.isArray(data)) throw new Error('Not an array'); const cleaned = data.filter(o => o?.name && o?.id).map(o => ({ id: Number(o.id), name: String(o.name).trim(), gen: Number(o.gen ?? o.generation ?? 0) || 0 })); logInfo(`[POKEDEX] Loaded ${cleaned.length} species from ${path.basename(POKEDEX_PATH)}.`); return cleaned; } catch (err) { logWarn(`[POKEDEX] Using fallback list. Reason: ${err.message}`); const fallback = ["Bulbasaur","Ivysaur","Venusaur","Charmander","Charmeleon","Charizard","Squirtle","Wartortle","Blastoise","Caterpie","Metapod","Butterfree","Pikachu","Mewtwo","Mew"]; return fallback.map((name, i) => ({ id: i + 1, name, gen: 1 })); } }
const POKEMON_LIST_FULL = loadPokedexData();
const POKEMON_LIST = POKEMON_LIST_FULL.map(p => p.name);
const POKEMON_NAME_REGEX = new RegExp('\\b(' + POKEMON_LIST.slice().sort((a,b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]?')).join('|') + ')\\b', 'i');
logInfo(`[POKEDEX] Name‑regex built (${POKEMON_LIST.length} names).`);
const pokemonNameToIdMap = new Map(POKEMON_LIST_FULL.map(p => [p.name, p.id]));

// ──────────────────────────────────────────────────────────────────────────────
// Message Handlers
// ──────────────────────────────────────────────────────────────────────────────
async function handleMessageCreate(msg) {
  try {
    if (msg.channel.id !== TARGET_CHANNEL_ID) return;
    const reveal = msg.components?.flatMap(r => r.components).find(c => c.type === 'BUTTON' && c.label?.toLowerCase().includes('reveal'));
    if (!reveal) return;
    const flatText = flattenMessageLike(msg);
    await dump('msg', toPlainMessage(msg));
    const pokemonName = extractPokemonNameSmart(flatText);
    if (!pokemonName) { return logInfo(`[FILTER] Skipping message in '${msg.guild?.name}' because no Pokémon name was found.`); }
    if (pokemonFilterCanon.size > 0) {
      if (!pokemonFilterCanon.has(canonName(pokemonName))) { return logInfo(`[FILTER] Skipping ${pokemonName} (not selected).`); }
    }
    logInfo('[ACTION] Reveal spotted', `(${pokemonName} in server ${msg.guild?.name || 'Unknown'})`);
    const meta = parseMessageForStats(flatText, Number(msg.createdTimestamp||Date.now()), pokemonName);
    clickedPokemonQueue.push(meta);
    const quick = extractCoords(reveal.customId);
    if (quick) {
      const meta2 = clickedPokemonQueue.shift();
      return sendNotification(quick[1], quick[2], meta2);
    }
    await msg.clickButton(reveal.customId);
  } catch (err) {
    logError('[handleMessageCreate] error:', err);
  }
}

async function sendNotification(lat, lng, metaOrName) {
  const latF = Number(lat); const lngF = Number(lng);
  if (Number.isNaN(latF) || Number.isNaN(lngF)) return logWarn('[NTFY] Invalid coords; skipping.');
  if (GEOFENCE_CENTER && GEOFENCE_RADIUS_KM > 0 && validateCoordPair(GEOFENCE_CENTER)) {
    const dist = haversineDistance(GEOFENCE_CENTER, [latF, lngF]);
    if (dist > GEOFENCE_RADIUS_KM) return logInfo(`[FOUND] ${latF.toFixed(5)},${lngF.toFixed(5)} → Outside geofence. Not sent.`);
  }

  const meta = (metaOrName && typeof metaOrName === 'object') ? metaOrName : { name: metaOrName };
  const name = meta?.name || null;
  const parts = [];
  if (Number.isFinite(meta.level)) parts.push(`L${meta.level}`);
  if (Number.isFinite(meta.cp))    parts.push(`CP ${meta.cp}`);
  if (Number.isFinite(meta.ivPct)) parts.push(`${Math.round(meta.ivPct*10)/10}%`);
  const isHundo = Number.isFinite(meta.ivPct) && Math.round(meta.ivPct) === 100;
  const titleRaw = name ? `${name}${parts.length ? ' - ' + parts.join(' | ') : ' Found!'}` : 'Coordinates Received!';
  const title = sanitizeHeaderValue(titleRaw);
  const body  = (isHundo ? '💯 ' : '') + (formatDespawn(meta?.despawnEpoch) || '');
  const deep  = `itoolsbt://jumpLocation?lat=${latF}&lng=${lngF}`; // keep existing scheme

  if (!NTFY_TOPIC) {
    logInfo(`[NTFY disabled] ${latF},${lngF} ${title}`);
    return;
  }
  try {
    let pokemonId;
    if (name && pokemonNameToIdMap.has(name)) {
      pokemonId = pokemonNameToIdMap.get(name);
      // No attachment/icon to keep notifications text-only as requested
    }
    
    // Use JSON format with actions array for better iOS linking
    const payload = {
      topic: NTFY_TOPIC,
      title: title,
      message: body || ' ',
      actions: [
        {
          action: "view",
          label: "Open Location", 
          url: deep,
          clear: true
        }
      ]
    };
    
    const response = await fetch(`https://ntfy.sh/`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    // Get the message ID for potential future reference
    const messageId = response.headers.get('X-Message-Id');
    if (messageId) {
      logInfo(`[NTFY] Message sent with ID: ${messageId}`);
    }
    const idTag = pokemonId ? ` [PK:${pokemonId}]` : '';
    logInfo(name ? `[FOUND]${idTag} ${name}${parts.length ? ' • ' + parts.join(' • ') : ''} • ${latF.toFixed(5)},${lngF.toFixed(5)}${body ? ' • ' + body : ''}` : '✔ ntfy sent (Coordinates)');
  } catch (e) {
    logError('✘ ntfy failed:', e);
  }
}

function handleWsMessageUpdate(pkt) {
  try {
    if (pkt.channel_id !== TARGET_CHANNEL_ID) return;
    const flags = Number(pkt.flags ?? 0);
    if (flags !== 0 && (flags & 64) === 0) return;

    const flat = flattenGatewayPkt(pkt);
    dump('update', toPlainUpdate(pkt));
    const coords = extractCoords(flat);
    if (coords) {
      const meta = clickedPokemonQueue.shift();
      // Enrich with any stats visible in this update
      const fresh = parseMessageForStats(flat, Date.now(), meta?.name);
      const merged = {
        name: (meta && meta.name) || fresh.name,
        level: Number.isFinite(meta?.level) ? meta.level : fresh.level,
        cp: Number.isFinite(meta?.cp) ? meta.cp : fresh.cp,
        ivPct: Number.isFinite(meta?.ivPct) ? meta.ivPct : fresh.ivPct,
        ivAtk: Number.isFinite(meta?.ivAtk) ? meta.ivAtk : fresh.ivAtk,
        ivDef: Number.isFinite(meta?.ivDef) ? meta.ivDef : fresh.ivDef,
        ivSta: Number.isFinite(meta?.ivSta) ? meta.ivSta : fresh.ivSta,
        despawnEpoch: meta?.despawnEpoch || fresh.despawnEpoch
      };

      if (merged.name) {
        logInfo(`[SUCCESS] Coords for ${merged.name} → ${coords[1]},${coords[2]}`);
      }
      sendNotification(coords[1], coords[2], merged);
    }
  } catch (err) {
    logError('[handleWsMessageUpdate] error:', err);
  }
}
function handleWsMessageCreate(pkt) {}
function handleWsInteractionCreate(pkt) {}

// ──────────────────────────────────────────────────────────────────────────────
// API & Server Start
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  client.on('messageCreate', handleMessageCreate);
  client.ws.on('MESSAGE_UPDATE', handleWsMessageUpdate);
  client.ws.on('MESSAGE_CREATE', handleWsMessageCreate);
  client.ws.on('INTERACTION_CREATE', handleWsInteractionCreate);

  await readPokemonFilter();
  await loadDiscordIds();

  const GEN_BUCKETS = {};
  for (const p of POKEMON_LIST_FULL) { const g = Number(p.gen) || 0; if (!GEN_BUCKETS[g]) GEN_BUCKETS[g] = []; GEN_BUCKETS[g].push(p.name); }
  logInfo(`[POKEDEX] Built generation buckets: ${Object.keys(GEN_BUCKETS).length} gens.`);

  app.get('/api/discord-ids', (req, res) => { res.json({ serverId: TARGET_SERVER_ID, channelId: TARGET_CHANNEL_ID, botId: TARGET_BOT_ID }); });
  app.post('/api/discord-ids', async (req, res) => { const { serverId, channelId, botId } = req.body; if (!serverId || !channelId || !botId) { return res.status(400).json({ success: false, message: 'All IDs are required.' }); } const ok = await writeDiscordIds({ serverId, channelId, botId }); if (!ok) return res.status(500).json({ success: false, message: 'Failed to save Discord IDs.' }); res.json({ success: true, message: 'Discord IDs saved successfully.' }); });
  app.get('/api/geofence', (req, res) => res.json({ center: GEOFENCE_CENTER, radius: GEOFENCE_RADIUS_KM }));
  app.post('/api/geofence', (req, res) => { const { center, radius } = req.body || {}; let centerNum = Array.isArray(center) && center.length === 2 ? center.map(Number).map(n => (Number.isFinite(n) ? n : NaN)) : null; const radiusNum = Number(radius); if (centerNum && validateCoordPair(centerNum) && Number.isFinite(radiusNum)) { GEOFENCE_CENTER = centerNum; GEOFENCE_RADIUS_KM = radiusNum; logInfo(`[API] Geofence updated: Center=${centerNum.join(',')} Radius=${radiusNum}km`); res.json({ success: true, message: 'Geofence updated successfully.' }); } else { res.status(400).json({ success: false, message: 'Invalid geofence data provided.' }); } });
  app.get('/api/filter/pokemon', async (req, res) => { await readPokemonFilter(); res.json(pokemonFilterCache); });
  app.post('/api/filter/pokemon', async (req, res) => { if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Expected array of Pokémon names.' }); const ok = await writePokemonFilter(req.body.map(String)); if (!ok) return res.status(500).json({ success: false, message: 'Failed to save Pokémon filter.' }); res.json({ success: true, message: 'Pokémon filter saved successfully.' }); });
  app.get('/api/pokemon', (req, res) => { if ((req.query.group || '').toLowerCase() === 'gen') return res.json({ gens: GEN_BUCKETS }); res.json(POKEMON_LIST); });
  app.get('/api/pokedex', (req, res) => { res.json(POKEMON_LIST_FULL); });
  app.get('/api/logs', async (req, res) => { if (req.query.source !== 'file' && logBuffer.length) return res.json(logBuffer); try { const data  = await fsp.readFile(LOG_PATH, 'utf8'); const lines = data.split(/\r?\n/).filter(Boolean).slice(-MAX_LOG_LINES); res.json(lines); } catch (err) { logError('[API] Failed to read log file:', err); res.status(500).json({ error: 'Failed to read log file.' }); } });
  app.post('/api/debug/extract', (req, res) => { const fakeMsg = req.body || {}; const flatText = flattenMessageLike(fakeMsg); const name = extractPokemonNameSmart(flatText); res.json({ input: flatText, detected: name }); });
  app.post('/api/shutdown', (req, res) => { logWarn('Shutdown command received from UI. Shutting down...'); res.json({ success: true, message: 'Shutdown initiated.' }); setTimeout(() => { process.exit(0); }, 500); });
  
  const DEFAULT_PORT = 4000;
  let PORT_NUM = Number(process.env.API_PORT ?? process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isFinite(PORT_NUM)) PORT_NUM = DEFAULT_PORT;
  const server = app.listen(PORT_NUM, () => logInfo(`Server listening on port ${PORT_NUM}`));
  server.on('error', err => { logError('[HTTP SERVER ERROR]', err.stack || err); if (FAIL_FAST) process.exit(1); });
  
  logInfo('Attempting to log in to Discord...');
  await client.login(TOKEN);
}

main().catch(err => {
  logError('[FATAL STARTUP ERROR]', err);
  if (FAIL_FAST) process.exit(1);
});
