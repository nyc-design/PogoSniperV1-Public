# Pogo “Reveal” Self‑Bot

![GitHub Repo Size](https://img.shields.io/github/repo-size/Shrek3294/PogoSniperV1-Public)
![License](https://img.shields.io/github/license/Shrek3294/PogoSniperV1-Public)

A Discord self‑bot that listens for “Reveal” buttons from a specific bot in a
specified channel, extracts geocoordinates, applies an optional geofence filter,
and sends push notifications via **ntfy**. Perfect for tracking live Pokémon GO
spawns in your area.

---

## 🚀 Features

* **Auto‑click** Discord “Reveal” buttons
* **Extract** latitude/longitude from button IDs or ephemeral replies
* **Geofence** support: ignore notifications outside a specified radius (disable by setting radius to `0`)
* **Push alerts** with deep‑link to iTools BT
* **Configurable** via environment variables

## 📦 Installation

1. **Clone** your fork:

   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   ```
2. **Install** dependencies:

   ```bash
   npm install discord.js-selfbot-v13 node-fetch dotenv
   ```
3. **Rename** your `.env.example` to `.env`, then fill in:

   ```env
   DISCORD_TOKEN=YOUR_DISCORD_TOKEN
   NTFY_TOKEN=YOUR_NTFY_TOPIC
   GEOFENCE_CENTER=40.7128,-74.0060  # optional
   GEOFENCE_RADIUS_KM=10             # 0 to disable
   ```

## 🎯 Running the Application
The Easy Way (Windows)
A start_dashboard.bat script is included in the root directory. Simply double-click it to launch both the backend and frontend servers in separate terminal windows.
You can also create a desktop shortcut of this .bat file
The Manual Way (All Platforms)
You will need two separate terminals.
1. In Terminal 1 (Backend):
   # From the project's root directory
      #  node Server-bot.js
2. In Terminal 2 (Frontend):
      # From the project's root directory
     #    cd frontend
     #    npm start

## 🖥️ Using the Dashboard
Pokémon Filter: Use the Gen tabs or the search bar to find Pokémon. Check the boxes for the ones you want to receive notifications for and click Save.
Geofence: Enter the coordinates and radius for your filter and click Save Geofence.
Logs: The logs panel will update automatically with the latest actions from the bot.
Shutdown: To turn everything off, click the Shutdown Bot Server button in the UI, then close the frontend terminal window.



## ⚙️ Configuration

| Variable             | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `DISCORD_TOKEN`      | Your Discord self‑bot token                          |
| `NTFY_TOKEN`         | Your `ntfy.sh` topic name                            |
| `GEOFENCE_CENTER`    | `lat,lng` center for radius filter (omit to disable) |
| `GEOFENCE_RADIUS_KM` | Radius in km (set to `0` to disable geofencing)      |
| `TARGET_SERVER_ID`   | ID of the Discord server to monitor                  |
| `TARGET_CHANNEL_ID`  | ID of the channel where "Reveal" messages appear     |
| `TARGET_BOT_ID`      | ID of the bot that posts the "Reveal" button         |

## 🎯 Usage

```bash
node bot.js
```

* On startup, the bot will log in and begin listening.
* When a "Reveal" button is spotted, it will click and parse coordinates.
* If inside the geofence (or geofencing is disabled), you'll get a push via `ntfy.sh`.





## 🤝 Contributing

1. Fork this repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m "feat: add my feature"`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

> Built with ❤️ by Shrek
