/*
 * =========================================================================================
 * Project: Simple IoT World
 * Hardware: ESP8266 (NodeMCU CP2102) + DHT11 + 16x2 I2C LCD (0x27) + LED
 * Developed with ❤️ by Pranav and Team (Department of ETC, SB Jain, Nagpur)
 * =========================================================================================
 * 
 * --- HARDWARE PINOUT CONNECTIONS ---
 * 1. NodeMCU ESP8266 Pin D5 (GPIO 14)  -> DHT11 Data Pin (with 10k pullup if sensor module doesn't have it)
 * 2. NodeMCU ESP8266 Pin D1 (GPIO 5)   -> 16x2 LCD I2C SCL
 * 3. NodeMCU ESP8266 Pin D2 (GPIO 4)   -> 16x2 LCD I2C SDA
 * 4. NodeMCU ESP8266 Pin D3 (GPIO 0)   -> LED Anode (+) [via 220-330 ohm resistor], LED Cathode (-) to GND
 * 5. NodeMCU ESP8266 VIN/3V3 & GND     -> VCC & GND of Sensors & LCD (LCD usually 5V/VIN for clear contrast)
 * 
 * --- REQUIRED ARDUINO LIBRARIES ---
 * 1. ESP8266WiFi & ESP8266HTTPClient (Built into ESP8266 Board Package)
 * 2. LiquidCrystal_I2C by Frank de Brabander (or Marco Schwartz)
 * 3. DHT sensor library by Adafruit + Adafruit Unified Sensor
 * 4. ArduinoJson by Benoit Blanchon (Version 6.x or 7.x)
 * =========================================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ================= PIN DEFINITIONS ================= //
#define DHTPIN D5          // DHT11 Sensor connected to D5 (GPIO 14)
#define DHTTYPE DHT11      // Sensor Type DHT11
#define LED_PIN D3         // LED connected to D3 (GPIO 0)

// LCD I2C Address @ 0x27 (16 columns, 2 rows)
// SDA = D2 (GPIO 4), SCL = D1 (GPIO 5)
LiquidCrystal_I2C lcd(0x27, 16, 2);
DHT dht(DHTPIN, DHTTYPE);

// ================= WIFI CREDENTIALS ================= //
const char* ssid     = "ESP8266";
const char* password = "12345678";

// ================= RENDER SERVER URL ================= //
// Paste your Render Web Service URL here after deployment (e.g. "https://simple-iot-world.onrender.com")
// Note: Keep trailing slash removed. If testing locally: "http://192.168.1.100:3000"
String serverUrl = ""; 

// Global variables for sensor readings and server state
float currentTemperature = 0.0;
float currentHumidity = 0.0;
String lcdLine1 = "SMART DISPLAY";
String lcdLine2 = "MyData";
bool ledState = false;

// Timing variables
unsigned long lastServerSyncTime = 0;
const unsigned long syncInterval = 10000; // 10 seconds interval to sync with server

// ================= HELPER FUNCTIONS ================= //

// Function to print exactly 16 characters on LCD row with padding to avoid ghost characters
void printLcdRow(int row, String text) {
  lcd.setCursor(0, row);
  String padded = text;
  while (padded.length() < 16) {
    padded += " ";
  }
  if (padded.length() > 16) {
    padded = padded.substring(0, 16);
  }
  lcd.print(padded);
}

// Function to fetch device state (LCD lines & LED state) from server
void fetchDeviceStateFromServer() {
  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) return;

  WiFiClientSecure clientSecure;
  WiFiClient clientHttp;
  HTTPClient http;

  String endpoint = serverUrl + "/api/device/state?device=esp8266";
  bool isHttps = serverUrl.startsWith("https://");

  if (isHttps) {
    clientSecure.setInsecure(); // Disable SSL certificate verification for Render.com
    http.begin(clientSecure, endpoint);
  } else {
    http.begin(clientHttp, endpoint);
  }

  http.setUserAgent("ESP8266-NodeMCU");
  http.setTimeout(4000);
  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.println("[HTTP] Device State Response: " + payload);

    // Parse JSON
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      if (doc.containsKey("lcdLine1")) {
        lcdLine1 = doc["lcdLine1"].as<String>();
      }
      if (doc.containsKey("lcdLine2")) {
        lcdLine2 = doc["lcdLine2"].as<String>();
      }
      if (doc.containsKey("ledState")) {
        ledState = doc["ledState"].as<bool>();
        // Apply LED State immediately to physical pin D3
        digitalWrite(LED_PIN, ledState ? HIGH : LOW);
      }
    } else {
      Serial.print("[JSON] Parse Error: ");
      Serial.println(error.c_str());
    }
  } else {
    Serial.printf("[HTTP] GET failed, code: %d\n", httpCode);
  }

  http.end();
}

// Function to send temperature and humidity to server
void sendSensorDataToServer(float temp, float hum) {
  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) return;

  WiFiClientSecure clientSecure;
  WiFiClient clientHttp;
  HTTPClient http;

  String endpoint = serverUrl + "/api/sensor-data";
  bool isHttps = serverUrl.startsWith("https://");

  if (isHttps) {
    clientSecure.setInsecure();
    http.begin(clientSecure, endpoint);
  } else {
    http.begin(clientHttp, endpoint);
  }

  http.addHeader("Content-Type", "application/json");
  http.setUserAgent("ESP8266-NodeMCU");
  http.setTimeout(4000);

  // Prepare JSON Payload
  DynamicJsonDocument doc(256);
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("[HTTP] Sending Sensor Payload: " + jsonString);
  int httpCode = http.POST(jsonString);

  if (httpCode == HTTP_CODE_CREATED || httpCode == HTTP_CODE_OK) {
    Serial.println("[HTTP] Sensor data successfully recorded by server!");
  } else {
    Serial.printf("[HTTP] POST failed, code: %d\n", httpCode);
  }

  http.end();
}

// ================= SETUP ================= //
void setup() {
  Serial.begin(115200);
  Serial.println("\n--- Simple IoT World Starting ---");

  // Initialize LED Pin D3
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Initialize DHT11 Sensor on Pin D5
  dht.begin();

  // Initialize LCD 16x2 on Pins D1 (SCL) & D2 (SDA)
  Wire.begin(D2, D1); // SDA = D2, SCL = D1
  lcd.init();
  lcd.backlight();
  lcd.clear();

  // -------------------------------------------------------------
  // SETUP DISPLAY SEQUENCE (Exact Prompt Requirements):
  // R1: MyProject
  // R2: WELCOME
  // delay(3S)
  // -------------------------------------------------------------
  printLcdRow(0, "MyProject");
  printLcdRow(1, "WELCOME");
  delay(3000);

  // -------------------------------------------------------------
  // R1: CONNECTING TO
  // R2: WiFi..........
  // -------------------------------------------------------------
  printLcdRow(0, "CONNECTING TO");
  printLcdRow(1, "WiFi..........");
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());

    // -------------------------------------------------------------
    // R1: CONNECTED TO
    // R2: WiFi....SUCCESS
    // delay(2s)
    // -------------------------------------------------------------
    printLcdRow(0, "CONNECTED TO");
    printLcdRow(1, "WiFi....SUCCESS");
    delay(2000);
  } else {
    Serial.println("\n[WiFi] Connection Failed/Timeout. Continuing in standalone mode.");
    printLcdRow(0, "WiFi STATUS:");
    printLcdRow(1, "CONNECT TIMEOUT");
    delay(2000);
  }

  // Initial read and fetch
  currentTemperature = dht.readTemperature();
  currentHumidity = dht.readHumidity();
  if (isnan(currentTemperature)) currentTemperature = 34.0;
  if (isnan(currentHumidity)) currentHumidity = 50.0;

  fetchDeviceStateFromServer();
  sendSensorDataToServer(currentTemperature, currentHumidity);
  lastServerSyncTime = millis();
}

// ================= MAIN LOOP ================= //
void loop() {
  // Check if WiFi connection is alive, reconnect if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection, reconnecting...");
    WiFi.reconnect();
  }

  // 1. Read DHT11 Sensor
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) {
    currentTemperature = t;
  }
  if (!isnan(h)) {
    currentHumidity = h;
  }

  // 2. Periodic Server Sync: Send Sensor Data & Fetch State every 10 Seconds
  if (millis() - lastServerSyncTime >= syncInterval) {
    Serial.println("\n--- 10s Server Sync Cycle ---");
    sendSensorDataToServer(currentTemperature, currentHumidity);
    fetchDeviceStateFromServer();
    lastServerSyncTime = millis();
  }

  // Ensure Physical LED on D3 matches server state
  digitalWrite(LED_PIN, ledState ? HIGH : LOW);

  // -------------------------------------------------------------
  // LCD DISPLAY CYCLE (Exact Prompt Requirements):
  //
  // Step 1:
  // R1: TEMPERATURE
  // R2: 38 'C
  // delay(2s)
  // -------------------------------------------------------------
  String tempStr = String((int)round(currentTemperature)) + " 'C";
  printLcdRow(0, "TEMPERATURE");
  printLcdRow(1, tempStr);
  delay(2000);

  // -------------------------------------------------------------
  // Step 2:
  // R1: HUMIDITY
  // R2: 59 %
  // delay(2s)
  // -------------------------------------------------------------
  String humStr = String((int)round(currentHumidity)) + " %";
  printLcdRow(0, "HUMIDITY");
  printLcdRow(1, humStr);
  delay(2000);

  // -------------------------------------------------------------
  // Step 3 (Get details from Server):
  // R1: SMART DISPLAY (or Line 1 from Server)
  // R2: MyData (or Line 2 from Server)
  // delay(2s)
  // -------------------------------------------------------------
  printLcdRow(0, lcdLine1.length() > 0 ? lcdLine1 : "SMART DISPLAY");
  printLcdRow(1, lcdLine2.length() > 0 ? lcdLine2 : "MyData");
  delay(2000);

  // -------------------------------------------------------------
  // Step 4 (Get this from Server):
  // R1: LED STATUS
  // R2: ON/OFF
  // delay(2s)
  // -------------------------------------------------------------
  printLcdRow(0, "LED STATUS");
  printLcdRow(1, ledState ? "ON" : "OFF");
  delay(2000);
}
