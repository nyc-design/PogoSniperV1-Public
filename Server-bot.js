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
// Logging (console + file + in-memory)
// ──────────────────────────────────────────────────────────────────────────────
const memoryStream = new Writable({
  write(chunk, _enc, cb) {
    pushLogLine(chunk.toString().trim());
    cb();
  }
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: LOG_PATH, maxsize: 5_000_000, maxFiles: 5 }),
    new winston.transports.Stream({ stream: memoryStream })
  ],
  exitOnError: false
});

const logInfo  = (...a) => logger.info(a.join(' '));
const logWarn  = (...a) => logger.warn(a.join(' '));
const logError = (...a) => logger.error(a.join(' '));

['log','warn','error'].forEach(m => {
  const orig = console[m].bind(console);
  console[m] = (...args) => {
    orig(...args);
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    if (m === 'warn') logger.warn(msg);
    else if (m === 'error') logger.error(msg);
    else logger.info(msg);
  };
});

// ──────────────────────────────────────────────────────────────────────────────
// Env Vars & IDs
// ──────────────────────────────────────────────────────────────────────────────
const TOKEN      = process.env.DISCORD_TOKEN;
const NTFY_TOPIC = process.env.NTFY_TOKEN;
const FAIL_FAST  = /^true$/i.test(process.env.FAIL_FAST || '');

if (!TOKEN)      logWarn('[WARN] DISCORD_TOKEN missing; login will fail.');
if (!NTFY_TOPIC) logWarn('[WARN] NTFY_TOKEN missing; notifications disabled.');

const TARGET_SERVER_ID  = '864766766932426772';
const TARGET_CHANNEL_ID = '991714778936520785';
const TARGET_BOT_ID     = '1028276349837774918';

const clickedPokemonQueue = [];

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
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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

function extractCoords(s) {
  return s && typeof s === 'string' ? s.match(coordsRx) : null;
}

function extractPokemonNameSmart(text = '') {
  if (!text) return null;
  const bold = text.match(pokemonBoldRx);
  if (bold?.[1]) return bold[1].trim();
  const m = POKEMON_NAME_REGEX ? POKEMON_NAME_REGEX.exec(text) : null;
  return m ? m[1].trim() : null;
}

function flattenMessageLike(src = {}) {
  const out = [];
  if (src.author?.name) out.push(src.author.name);
  if (src.content) out.push(src.content);
  if (src.title) out.push(src.title);
  if (src.description) out.push(src.description);
  for (const e of (src.embeds || [])) {
    if (e.author?.name) out.push(e.author.name);
    if (e.title) out.push(e.title);
    if (e.description) out.push(e.description);
    if (e.footer?.text) out.push(e.footer.text);
    if (e.url) out.push(e.url);
    for (const f of (e.fields || [])) {
      if (f.name) out.push(f.name);
      if (f.value) out.push(f.value);
    }
  }
  for (const r of (src.components || [])) {
    for (const c of (r.components || [])) {
      if (c.url) out.push(c.url);
      if (c.custom_id) out.push(c.custom_id);
      if (c.label) out.push(c.label);
    }
  }
  return out.filter(Boolean).join(' ');
}

function flattenGatewayPkt(pkt = {}) {
  const out = [];
  if (pkt.content) out.push(pkt.content);
  if (pkt.data) out.push(flattenMessageLike(pkt.data));
  if (pkt.message) out.push(flattenMessageLike(pkt.message));
  if (pkt.embeds) out.push(flattenMessageLike({ embeds: pkt.embeds }));
  return out.filter(Boolean).join(' ');
}

// ──────────────────────────────────────────────────────────────────────────────
// Pokémon Filter & Data
// ──────────────────────────────────────────────────────────────────────────────
const POKEMON_FILTER_FILE = path.join(__dirname, 'pokemon_filter.json');
let pokemonFilterCache = [];
let pokemonFilterCanon = new Set();
const POKEDEX_PATH = path.join(__dirname, 'data', 'pokedex.json');

function rebuildPokemonFilterCanon() {
  pokemonFilterCanon = new Set(pokemonFilterCache.map(canonName));
}

async function readPokemonFilter() {
  try {
    const data = await fsp.readFile(POKEMON_FILTER_FILE, 'utf8');
    pokemonFilterCache = JSON.parse(data);
    if (!Array.isArray(pokemonFilterCache)) pokemonFilterCache = [];
    logInfo('[INFO] Pokémon filter loaded. Count:', pokemonFilterCache.length);
  } catch (err) {
    pokemonFilterCache = [];
    if (err.code !== 'ENOENT') logError('[ERROR] Failed to read Pokémon filter file:', err);
    else logInfo('[INFO] pokemon_filter.json not found. Starting with empty filter.');
  }
  rebuildPokemonFilterCanon();
}

async function writePokemonFilter(list) {
  try {
    await fsp.writeFile(POKEMON_FILTER_FILE, JSON.stringify(list, null, 2));
    pokemonFilterCache = list.slice();
    rebuildPokemonFilterCanon();
    logInfo('[API] Pokémon filter saved. Count:', pokemonFilterCache.length);
    return true;
  } catch (err) {
    logError('[API] Failed to save Pokémon filter:', err);
    return false;
  }
}

function loadPokedexData() {
  try {
    const data = JSON.parse(fs.readFileSync(POKEDEX_PATH, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Not an array');
    const cleaned = data
      .filter(o => o?.name && o?.id) // Ensure ID is present for sprite lookup
      .map(o => ({ id: Number(o.id), name: String(o.name).trim(), gen: Number(o.gen ?? o.generation ?? 0) || 0 }));
    logInfo(`[POKEDEX] Loaded ${cleaned.length} species from ${path.basename(POKEDEX_PATH)}.`);
    return cleaned;
  } catch (err) {
    logWarn(`[POKEDEX] Using fallback list. Reason: ${err.message}`);
    const fallback = ["Bulbasaur","Ivysaur","Venusaur","Charmander","Charmeleon","Charizard","Squirtle","Wartortle","Blastoise","Caterpie","Metapod","Butterfree","Pikachu","Mewtwo","Mew"];
    return fallback.map((name, i) => ({ id: i + 1, name, gen: 1 }));
  }
}

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
    if (msg.guild?.id !== TARGET_SERVER_ID || msg.channel.id !== TARGET_CHANNEL_ID || msg.author.id !== TARGET_BOT_ID) {
      return;
    }
    const flatText = flattenMessageLike(msg);
    const pokemonName = extractPokemonNameSmart(flatText);
    if (pokemonFilterCanon.size > 0) {
      if (!pokemonName) { return; }
      if (!pokemonFilterCanon.has(canonName(pokemonName))) { return logInfo(`[FILTER] Skipping ${pokemonName} (not selected).`); }
    }
    const reveal = msg.components?.flatMap(r => r.components).find(c => c.type === 'BUTTON' && c.label?.toLowerCase() === 'reveal');
    if (!reveal) return;
    logInfo('[ACTION] Reveal spotted', pokemonName ? `(${pokemonName})` : '');
    
    clickedPokemonQueue.push(pokemonName);
    
    const quick = extractCoords(reveal.customId);
    if (quick) {
      const name = clickedPokemonQueue.pop();
      return sendNotification(quick[1], quick[2], name);
    }
    
    await msg.clickButton(reveal.customId);
  } catch (err) {
    logError('[handleMessageCreate] error:', err);
  }
}

async function sendNotification(lat, lng, pokemonName) {
  const latF = Number(lat); const lngF = Number(lng);
  if (Number.isNaN(latF) || Number.isNaN(lngF)) return logWarn('[NTFY] Invalid coords; skipping.');
  if (GEOFENCE_CENTER && GEOFENCE_RADIUS_KM > 0 && validateCoordPair(GEOFENCE_CENTER)) {
    const dist = haversineDistance(GEOFENCE_CENTER, [latF, lngF]);
    if (dist > GEOFENCE_RADIUS_KM) return logInfo(`[FOUND] ${latF.toFixed(5)},${lngF.toFixed(5)} → Outside geofence. Not sent.`);
  }

  const title = pokemonName ? `${pokemonName} Found!` : 'Coordinates Received!';
  const deep = `itoolsbt://jumpLocation?lat=${latF}&lng=${lngF}`;
  if (!NTFY_TOPIC) return logInfo(`[NTFY disabled] ${latF},${lngF} ${title}`);
  
  try {
    const headers = { Title: title, Priority: 'high', Tags: 'iphone,arrow_forward,white_check_mark', Click: deep, 'X-Deep-Link': 'true' };
    
    if (pokemonName && pokemonNameToIdMap.has(pokemonName)) {
        const pokemonId = pokemonNameToIdMap.get(pokemonName);
        headers.Icon = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png?v=${Date.now()}`;
    }

    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, { method: 'POST', body: `${latF},${lngF}`, headers: headers });
    logInfo(pokemonName ? `✔ ntfy sent for ${pokemonName}` : '✔ ntfy sent (Coordinates)');
  } catch (e) {
    logError('✘ ntfy failed:', e);
  }
}

function handleWsMessageUpdate(pkt) {
  try {
    if (pkt.channel_id !== TARGET_CHANNEL_ID) return;
    const flags = Number(pkt.flags ?? 0);
    if (flags !== 0 && (flags & 64) === 0) return;
    const coords = extractCoords(flattenGatewayPkt(pkt));
    if (coords) {
      const pokemonName = clickedPokemonQueue.shift();
      if (pokemonName) {
        logInfo(`[SUCCESS] Coords for ${pokemonName} → ${coords[1]},${coords[2]}`);
        sendNotification(coords[1], coords[2], pokemonName);
      } else {
        logWarn('[WARN] Got coordinates, but the Pokémon queue was empty.');
        sendNotification(coords[1], coords[2], null);
      }
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

  const GEN_BUCKETS = {};
  for (const p of POKEMON_LIST_FULL) { const g = Number(p.gen) || 0; if (!GEN_BUCKETS[g]) GEN_BUCKETS[g] = []; GEN_BUCKETS[g].push(p.name); }
  logInfo(`[POKEDEX] Built generation buckets: ${Object.keys(GEN_BUCKETS).length} gens.`);

  app.get('/api/geofence', (req, res) => res.json({ center: GEOFENCE_CENTER, radius: GEOFENCE_RADIUS_KM }));
  app.post('/api/geofence', (req, res) => { const { center, radius } = req.body || {}; let centerNum = Array.isArray(center) && center.length === 2 ? center.map(Number).map(n => (Number.isFinite(n) ? n : NaN)) : null; const radiusNum = Number(radius); if (centerNum && validateCoordPair(centerNum) && Number.isFinite(radiusNum)) { GEOFENCE_CENTER = centerNum; GEOFENCE_RADIUS_KM = radiusNum; logInfo(`[API] Geofence updated: Center=${centerNum.join(',')} Radius=${radiusNum}km`); res.json({ success: true, message: 'Geofence updated successfully.' }); } else { res.status(400).json({ success: false, message: 'Invalid geofence data provided.' }); } });
  app.get('/api/filter/pokemon', async (req, res) => { await readPokemonFilter(); res.json(pokemonFilterCache); });
  app.post('/api/filter/pokemon', async (req, res) => { if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Expected array of Pokémon names.' }); const ok = await writePokemonFilter(req.body.map(String)); if (!ok) return res.status(500).json({ success: false, message: 'Failed to save Pokémon filter.' }); res.json({ success: true, message: 'Pokémon filter saved successfully.' }); });
  app.get('/api/pokemon', (req, res) => { if ((req.query.group || '').toLowerCase() === 'gen') return res.json({ gens: GEN_BUCKETS }); res.json(POKEMON_LIST); });
  app.get('/api/logs', async (req, res) => { if (req.query.source !== 'file' && logBuffer.length) return res.json(logBuffer); try { const data  = await fsp.readFile(LOG_PATH, 'utf8'); const lines = data.split(/\r?\n/).filter(Boolean).slice(-MAX_LOG_LINES); res.json(lines); } catch (err) { logError('[API] Failed to read log file:', err); res.status(500).json({ error: 'Failed to read log file.' }); } });
  app.post('/api/debug/extract', (req, res) => { const fakeMsg = req.body || {}; const flatText = flattenMessageLike(fakeMsg); const name = extractPokemonNameSmart(flatText); res.json({ input: flatText, detected: name }); });
  

  // --- NEW: Shutdown Endpoint ---
  app.post('/api/shutdown', (req, res) => {
    logWarn('Shutdown command received from UI. Shutting down...');
    res.json({ success: true, message: 'Shutdown initiated.' });
    
    // Give the response time to send before exiting
    setTimeout(() => {
        process.exit(0);
    }, 500);
  });
  // ------------------------------



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