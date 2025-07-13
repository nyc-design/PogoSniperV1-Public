const { Client } = require('discord.js-selfbot-v13');
const fetch = require('node-fetch');

// Create a new client instance
const client = new Client({
    checkUpdate: false,
});

// --- CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN; // Replace with your token
const TARGET_USER_ID = '1219316418567475230'; // Replace with the bot's user ID
const NTFY_TOPIC = process.env.NTFY_TOKEN; // Replace with your ntfy topic
// ---------------------

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Listening for DMs from user ID: ${TARGET_USER_ID}`);
    console.log(`Notifications will be sent to ntfy.sh topic: ${NTFY_TOPIC}`);
});

client.on('messageCreate', async (message) => {
    if (message.channel.type === 'DM' && message.author.id === TARGET_USER_ID) {
        console.log(`[DM from ${message.author.tag}]: ${message.content}`);

        const coordRegex = /(-?\d+\.\d+),(-?\d+\.\d+)/;
        const match = message.content.match(coordRegex);

        if (match) {
            const latitude = match[1];
            const longitude = match[2];
            console.log(`Coordinates found: Lat: ${latitude}, Lng: ${longitude}`);
            await sendNotification(latitude, longitude, message.content);
        } else {
            console.log('No coordinates found in this message.');
        }
    }
});

async function sendNotification(lat, lng, fullMessage) {
    const pokemonNameMatch = fullMessage.match(/\*\*(\w+)\*\*/);
    const title = pokemonNameMatch ? `${pokemonNameMatch[1]} Found!` : 'Coordinates Received!';
    const messageBody = `${lat},${lng}`;
    const directTalosUrl = `itoolsbt://jumpLocation?lat=${lat}&lng=${lng}`;

    console.log(`Sending notification with direct TalosRoute URL: ${directTalosUrl}`);

    try {
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            body: messageBody,
            headers: {
                'Title': title,
                'Priority': 'high',
                'Tags': 'iphone,arrow_forward,white_check_mark',
                'Click': directTalosUrl,
                'X-Deep-Link': 'true'
            }
        } );
        console.log('Notification sent successfully!');
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

// Log in to Discord
client.login(TOKEN);
console.log('Attempting to log in...');

// --- FIX: ADD THIS LINE TO KEEP THE SCRIPT RUNNING ---
setInterval(() => {}, 1 << 30);
// ----------------------------------------------------
