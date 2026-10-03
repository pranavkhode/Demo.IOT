const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SENSOR_DATA_FILE = path.join(DATA_DIR, 'sensor_data.json');
const DEVICE_STATE_FILE = path.join(DATA_DIR, 'device_state.json');

// Helper to safely read JSON
function readJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJSON(filePath, defaultValue);
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content || JSON.stringify(defaultValue));
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Helper to safely write JSON atomically
function writeJSON(filePath, data) {
  try {
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

// Format timestamp to Asia/Kolkata (UTC+5:30) Time & Date
function formatKolkataDateTime(dateObj = new Date()) {
  try {
    const timeFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const dateFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const time = timeFormatter.format(dateObj);
    const date = dateFormatter.format(dateObj).replace(/\//g, '-');

    return { time, date };
  } catch (e) {
    // Fallback manual offset for UTC+5:30
    const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    
    let hours = ist.getHours();
    const minutes = String(ist.getMinutes()).padStart(2, '0');
    const seconds = String(ist.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const time = `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;

    const day = String(ist.getDate()).padStart(2, '0');
    const month = String(ist.getMonth() + 1).padStart(2, '0');
    const year = ist.getFullYear();
    const date = `${day}-${month}-${year}`;

    return { time, date };
  }
}

// Initialize files if not existing
function initDB() {
  if (!fs.existsSync(USERS_FILE)) {
    writeJSON(USERS_FILE, []);
  }

  if (!fs.existsSync(SENSOR_DATA_FILE)) {
    // Seed with a few realistic initial readings
    const now = new Date();
    const sampleData = [];
    for (let i = 5; i >= 1; i--) {
      const pastTime = new Date(now.getTime() - i * 60 * 1000);
      const { time, date } = formatKolkataDateTime(pastTime);
      sampleData.push({
        id: `sample_${Date.now() - i * 60000}`,
        temperature: Number((32 + Math.random() * 3).toFixed(1)),
        humidity: Math.round(50 + Math.random() * 10),
        timestamp: pastTime.getTime(),
        time,
        date
      });
    }
    writeJSON(SENSOR_DATA_FILE, sampleData);
  }

  if (!fs.existsSync(DEVICE_STATE_FILE)) {
    writeJSON(DEVICE_STATE_FILE, {
      lcdLine1: "SMART DISPLAY",
      lcdLine2: "MyData",
      ledState: false,
      lastSeen: 0
    });
  }
}

initDB();

module.exports = {
  getUsers: () => readJSON(USERS_FILE, []),
  saveUsers: (users) => writeJSON(USERS_FILE, users),

  getSensorData: () => readJSON(SENSOR_DATA_FILE, []),
  saveSensorData: (data) => writeJSON(SENSOR_DATA_FILE, data),

  getDeviceState: () => readJSON(DEVICE_STATE_FILE, {
    lcdLine1: "SMART DISPLAY",
    lcdLine2: "MyData",
    ledState: false,
    lastSeen: 0
  }),
  saveDeviceState: (state) => writeJSON(DEVICE_STATE_FILE, state),

  formatKolkataDateTime
};
