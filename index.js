const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://ai-factory-project-357407-default-rtdb.firebaseio.com/"
});

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = {};

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const deviceId = params.get('deviceId');
  const sensorType = params.get('sensorType');

  if (!deviceId || !sensorType) {
    ws.close(1008, 'Device ID and Sensor Type required');
    return;
  }

  if (!clients[deviceId]) {
    clients[deviceId] = {};
  }

  if (!clients[deviceId][sensorType]) {
    clients[deviceId][sensorType] = [];
  }

  clients[deviceId][sensorType].push(ws);

  ws.on('close', () => {
    clients[deviceId][sensorType] = clients[deviceId][sensorType].filter(client => client !== ws);
    if (clients[deviceId][sensorType].length === 0) {
      delete clients[deviceId][sensorType];
    }
    if (Object.keys(clients[deviceId]).length === 0) {
      delete clients[deviceId];
    }
  });

  ws.on('message', (message) => {
    console.log(`Received message from ${deviceId} (${sensorType}): ${message}`);
  });
});

app.post('/', (req, res) => {
  const db = admin.database();
  const ref = db.ref('sensor-logger');
  const data = req.body;

  if (!data || !Array.isArray(data.payload)) {
    res.status(400).send('Invalid payload');
    return;
  }

  const orientationData = data.payload.filter(item => item.name === 'orientation');
  const microphoneData = data.payload.filter(item => item.name === 'microphone');

  const orientationRef = ref.child('orientation');
  orientationData.forEach(item => {
    orientationRef.child(item.time.toString()).set(item.values);
  });

  const microphoneRef = ref.child('microphone');
  microphoneData.forEach(item => {
    microphoneRef.child(item.time.toString()).set(item.values);
  });

  // Notify connected WebSocket clients
  data.payload.forEach(item => {
    if (clients[item.deviceId] && clients[item.deviceId][item.name]) {
      clients[item.deviceId][item.name].forEach(client => {
        client.send(JSON.stringify(item));
      });
    }
  });

  res.status(200).send('Data sent to clients successfully');
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
