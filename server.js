require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'simple_iot_world_secret_key_2026';
const ONLINE_THRESHOLD_MS = 25000; // 25 seconds without ping = offline

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Check if ESP8266 is online
function isDeviceOnline(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - lastSeen) < ONLINE_THRESHOLD_MS;
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  let token = req.cookies?.token;

  if (!token && req.headers['authorization']) {
    const authHeader = req.headers['authorization'];
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired session' });
    }
    req.user = decoded;
    next();
  });
}

// ================= AUTH ROUTES ================= //

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const users = db.getUsers();

    if (users.some(u => u.email === trimmedEmail)) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      id: `user_${Date.now()}`,
      name: name.trim(),
      email: trimmedEmail,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    db.saveUsers(users);

    const token = jwt.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: false, // accessible to client JS for simplicity and verification
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const users = db.getUsers();
    const user = users.find(u => u.email === trimmedEmail);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// ================= IOT & SENSOR DATA ROUTES ================= //

// Ingest Sensor Data (Called by ESP8266 or simulated in testing)
app.post('/api/sensor-data', (req, res) => {
  try {
    // Support JSON body or query parameters
    let temp = req.body.temperature ?? req.body.temp ?? req.query.temperature ?? req.query.temp;
    let hum = req.body.humidity ?? req.body.hum ?? req.query.humidity ?? req.query.hum;

    if (temp === undefined || hum === undefined) {
      return res.status(400).json({ success: false, message: 'Temperature and Humidity are required' });
    }

    temp = Number(parseFloat(temp).toFixed(1));
    hum = Number(parseFloat(hum).toFixed(1));

    if (isNaN(temp) || isNaN(hum)) {
      return res.status(400).json({ success: false, message: 'Temperature and Humidity must be numbers' });
    }

    const now = new Date();
    const { time, date } = db.formatKolkataDateTime(now);

    const newRecord = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      temperature: temp,
      humidity: hum,
      timestamp: now.getTime(),
      time,
      date
    };

    const records = db.getSensorData();
    records.push(newRecord);

    // Keep max 500 records to keep JSON database fast & lightweight
    if (records.length > 500) {
      records.splice(0, records.length - 500);
    }
    db.saveSensorData(records);

    // Update device heartbeat lastSeen
    const deviceState = db.getDeviceState();
    deviceState.lastSeen = Date.now();
    db.saveDeviceState(deviceState);

    return res.status(201).json({
      success: true,
      message: 'Sensor data recorded',
      data: newRecord
    });
  } catch (error) {
    console.error('Error saving sensor data:', error);
    res.status(500).json({ success: false, message: 'Failed to record sensor data' });
  }
});

// Get Latest Reading & Device Status
app.get('/api/sensor-data/latest', (req, res) => {
  try {
    const records = db.getSensorData();
    const deviceState = db.getDeviceState();
    const latest = records.length > 0 ? records[records.length - 1] : null;
    const online = isDeviceOnline(deviceState.lastSeen);

    res.json({
      success: true,
      data: latest || {
        temperature: 0,
        humidity: 0,
        time: '--:-- --',
        date: '--'
      },
      online,
      lastSeen: deviceState.lastSeen,
      totalRecords: records.length
    });
  } catch (error) {
    console.error('Error fetching latest sensor data:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get Sensor Data History (with Pagination)
app.get('/api/sensor-data/history', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || 'desc'; // 'desc' (newest first) or 'asc'

    const records = [...db.getSensorData()];

    if (sort === 'desc') {
      records.reverse();
    }

    const total = records.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedRecords = records.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      data: paginatedRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching sensor history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get Sensor Data for Chart (Latest N records chronological)
app.get('/api/sensor-data/chart', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 30;
    const records = db.getSensorData();
    const chartData = records.slice(-count);

    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete Record
app.delete('/api/sensor-data/:id', (req, res) => {
  try {
    const { id } = req.params;
    let records = db.getSensorData();
    const initialLen = records.length;

    records = records.filter(r => r.id !== id);

    if (records.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    db.saveSensorData(records);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Clear All Records (Helper)
app.delete('/api/sensor-data', (req, res) => {
  try {
    db.saveSensorData([]);
    res.json({ success: true, message: 'All records cleared' });
  } catch (error) {
    console.error('Error clearing records:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ================= DEVICE CONTROL & STATE ROUTES ================= //

// Get Device State (Called by ESP8266 or Web Dashboard)
app.get('/api/device/state', (req, res) => {
  try {
    const deviceState = db.getDeviceState();
    
    // If request has query parameter or user-agent indicating ESP8266, refresh lastSeen
    const isESP = req.query.device === 'esp8266' || (req.headers['user-agent'] && req.headers['user-agent'].includes('ESP8266'));
    if (isESP) {
      deviceState.lastSeen = Date.now();
      db.saveDeviceState(deviceState);
    }

    const online = isDeviceOnline(deviceState.lastSeen);

    res.json({
      success: true,
      lcdLine1: deviceState.lcdLine1 || "SMART DISPLAY",
      lcdLine2: deviceState.lcdLine2 || "MyData",
      ledState: Boolean(deviceState.ledState),
      online,
      lastSeen: deviceState.lastSeen
    });
  } catch (error) {
    console.error('Error fetching device state:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update LCD Lines (From Web Dashboard Tab 2)
app.post('/api/device/lcd', (req, res) => {
  try {
    const { line1, line2 } = req.body;

    const deviceState = db.getDeviceState();

    if (line1 !== undefined) {
      deviceState.lcdLine1 = String(line1).substring(0, 16);
    }
    if (line2 !== undefined) {
      deviceState.lcdLine2 = String(line2).substring(0, 16);
    }

    db.saveDeviceState(deviceState);

    res.json({
      success: true,
      message: 'LCD message updated successfully',
      lcdLine1: deviceState.lcdLine1,
      lcdLine2: deviceState.lcdLine2
    });
  } catch (error) {
    console.error('Error updating LCD:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update LED State (From Web Dashboard Tab 3)
app.post('/api/device/led', (req, res) => {
  try {
    const { state } = req.body;
    let ledState = false;

    if (typeof state === 'boolean') {
      ledState = state;
    } else if (typeof state === 'string') {
      ledState = state.toLowerCase() === 'on' || state === '1' || state === 'true';
    } else if (typeof state === 'number') {
      ledState = state === 1;
    }

    const deviceState = db.getDeviceState();
    deviceState.ledState = ledState;
    db.saveDeviceState(deviceState);

    res.json({
      success: true,
      message: `LED turned ${ledState ? 'ON' : 'OFF'}`,
      ledState: deviceState.ledState
    });
  } catch (error) {
    console.error('Error updating LED:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Device Online/Offline Status
app.get('/api/device/status', (req, res) => {
  try {
    const deviceState = db.getDeviceState();
    const online = isDeviceOnline(deviceState.lastSeen);
    const lastSeenAgo = deviceState.lastSeen ? Math.round((Date.now() - deviceState.lastSeen) / 1000) : null;

    res.json({
      success: true,
      online,
      lastSeen: deviceState.lastSeen,
      lastSeenAgoSeconds: lastSeenAgo
    });
  } catch (error) {
    console.error('Error checking device status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// HTML Page Routes
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Simple IoT World Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📡 Ready for ESP8266 & Render.com deployment`);
  console.log(`===================================================`);
});
