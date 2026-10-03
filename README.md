# 🌐 Simple IoT World - Full-Stack IoT Web App & ESP8266 Cloud Platform

An end-to-end IoT platform featuring a modern **NodeJS + Express + Tailwind CSS** cloud dashboard connected in real-time to an **ESP8266 (NodeMCU CP2102)** with **DHT11 Sensor**, **16x2 I2C LCD Display**, and an **Actuator LED**.

> **Developed with ❤️ by Pranav and Team**  
> *Department of ETC, SB Jain, Nagpur*

---

## 🚀 Features Overview

### 1. Web Application (Frontend & Backend)
- **Tech Stack**: HTML5, Tailwind CSS, JavaScript (ES6+), Express.js, Node.js, JSON Database.
- **Theme**: Red Gradient Theme with smooth **Light / Dark Mode Switch** (persisted in localStorage).
- **Responsive Header**:
  - Displays App Name **Simple IoT World**.
  - Dynamic user greeting: **Welcome Pranav** (personalized to logged-in user).
  - Real-time **ONLINE / OFFLINE Status Badge** for ESP8266 (with pulsing heartbeat indicator).
  - Theme toggle & Logout button.
- **Page 1: Authentication**:
  - Sign In & User Registration (Name, Email, Password).
  - Password visibility toggle, validation & notifications.
- **Page 2: Web Dashboard**:
  - **Tab 1: Dashboard & Records**:
    - **Live Cards**: Large font typography for Temperature (°C) & Humidity (%) with Min/Max and comfort badges.
    - **Colorful Seek Bars / Gauges**: Visual dynamic gradient meters.
    - **Interactive Trends Graph (Chart.js)**: Real-time temperature and humidity line charts with time range views.
    - **Saved Records Table**: Formatted in **`Asia/Kolkata` (+05:30)** (`DD-MM-YYYY` & `HH:MM:SS AM/PM`).
    - Full **Pagination** (5, 10, 25, 50 per page), **Delete** action, and **CSV Export**.
  - **Tab 2: LCD Smart Display Control (16x2)**:
    - Field 1 (Row 1): Max 16 characters with live character counter.
    - Field 2 (Row 2): Max 16 characters with live character counter.
    - **Save Button**: Updates cloud state and renders instantly on the **Realistic 16x2 LCD Hardware Preview** screen.
  - **Tab 3: LED Actuator Switch**:
    - **Innovative 3D Neon Power Switch** to turn LED ON and OFF.
    - **Virtual Glowing LED Bulb** reacting in real-time.
- **Footer**:
  - *"Developed with ❤️ by Pranav and Team. Department of ETC, SB Jain, Nagpur"* (with animated pulsating heart).

---

## 🔌 Hardware Setup & Circuit Pinout

| Component | NodeMCU ESP8266 Pin | GPIO | Wire / Notes |
|---|---|---|---|
| **DHT11 (Data)** | **D5** | GPIO 14 | Connect DHT11 Data pin |
| **16x2 LCD (SCL)** | **D1** | GPIO 5 | I2C Clock Line (Address `0x27`) |
| **16x2 LCD (SDA)** | **D2** | GPIO 4 | I2C Data Line (Address `0x27`) |
| **LED Anode (+)** | **D3** | GPIO 0 | Connect through 220Ω resistor |
| **LED Cathode (-)** | **GND** | GND | Ground |
| **VCC (DHT11 & LCD)** | **VIN / 3V3** | Power | Connect to 5V (VIN) or 3.3V |
| **GND** | **GND** | Ground | Common Ground |

---

## 💻 ESP8266 Firmware Instructions

The Arduino sketch is located at: `esp8266/SimpleIoTWorld_ESP8266.ino`.

### 1. Required Arduino Libraries
Install these from the Arduino IDE Library Manager (**Tools -> Manage Libraries...**):
1. **LiquidCrystal_I2C** (by Frank de Brabander / Marco Schwartz)
2. **DHT sensor library** (by Adafruit) + **Adafruit Unified Sensor**
3. **ArduinoJson** (by Benoit Blanchon - Version 6 or 7)
4. **ESP8266 Board Package** (by ESP8266 Community in Board Manager)

### 2. Configure WiFi & Render URL
In `esp8266/SimpleIoTWorld_ESP8266.ino`:
```cpp
const char* ssid     = "ESP8266";
const char* password = "12345678";

// Add your Render URL after deployment:
String serverUrl = "https://your-app-name.onrender.com";
```

### 3. Startup Sequence (Exact Workflow)
- **In Setup**:
  1. Row 1: `MyProject` | Row 2: `WELCOME` *(delay 3s)*
  2. Row 1: `CONNECTING TO` | Row 2: `WiFi..........`
  3. Row 1: `CONNECTED TO` | Row 2: `WiFi....SUCCESS` *(delay 2s)*
- **In Loop** (Repeats):
  1. Sends Temperature & Humidity to Server every 10 seconds.
  2. Fetches LCD text and LED state from Server.
  3. Row 1: `TEMPERATURE` | Row 2: `38 'C` *(delay 2s)*
  4. Row 1: `HUMIDITY` | Row 2: `59 %` *(delay 2s)*
  5. Row 1: `SMART DISPLAY` | Row 2: `MyData` *(delay 2s)*
  6. Row 1: `LED STATUS` | Row 2: `ON/OFF` *(delay 2s)*

---

## ☁️ Deploying to Render.com

Deploying this application to Render is completely free and takes under 2 minutes:

1. Push this project to your **GitHub** repository.
2. Go to [Render.com Dashboard](https://dashboard.render.com/) and click **New + -> Web Service**.
3. Connect your GitHub repository.
4. Fill in the following settings:
   - **Name**: `simple-iot-world`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Click **Deploy Web Service**.
6. Copy your generated Render URL (e.g., `https://simple-iot-world.onrender.com`) and paste it into your ESP8266 code's `serverUrl` variable!

---

## 🧪 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start
```

Open your browser at `http://localhost:3000`.
