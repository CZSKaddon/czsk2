#!/usr/bin/env node

const express = require('express');
const bodyParser = require('body-parser');
const { getRouter } = require('stremio-addon-sdk');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const addonInterface = require('./addon');

// —— KONFIGURACE ——
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'secret';
const MOUNT_PATH = '/:token/:deviceMac';
const MAC_REGEX = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/i;

// ++ PŘIPOJENÍ K DATABÁZI ++
const MONGODB_URI = process.env.MONGODB_URI;
let conn = null;

const connectDB = async () => {
  if (conn == null) {
    conn = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).then(() => mongoose);
    await conn;
  }
  return conn;
};

// Schéma pro uživatele doplňku
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  hash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Schéma pro zařízení (tokeny) s Webshare údaji
const TokenSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  deviceId: { type: String, required: true },
  wst: { type: String }, // Zde bude uložen Webshare Token
});
TokenSchema.index({ token: 1, deviceId: 1 });
const Token = mongoose.models.Token || mongoose.model('Token', TokenSchema);

// —— EXPRESS SERVER ——
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).send('Could not connect to the database.');
  }
});

// ++ FUNKCE PRO ZÍSKÁNÍ WEBSHARE TOKENU (WST) ++
async function getWst(username, password) {
    if (!username || !password) return null;
    try {
        const saltResponse = await axios.get('https://webshare.cz/api/salt/', { params: { login: username } });
        const saltMatch = saltResponse.data.match(/<salt>(.*?)<\/salt>/);
        if (!saltMatch) throw new Error('Could not get salt from Webshare');
        const salt = saltMatch[1];
        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');
        const finalHash = crypto.createHash('sha1').update(salt + hashedPassword).digest('hex');
        
        // Ověříme, zda je token platný
        const checkResponse = await axios.get('https://webshare.cz/api/user_data/', { params: { wst: finalHash } });
        if (checkResponse.data.includes('<status>OK</status>')) {
            return finalHash;
        }
        return null;
    } catch (error) {
        console.error('Error getting WST:', error.message);
        return null;
    }
}

// Ověření admina
function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Auth required');
  }
  const [u, p] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (u === ADMIN_USER && p === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('Invalid credentials');
}

function calcExpiry(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

// —— ADMINISTRAČNÍ PANEL ——
app.get('/admin', adminAuth, async (req, res) => {
  const users = await User.find().lean();
  const tokens = await Token.find().lean();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const testResult = req.query.ws_test;

  let testMessage = '';
  if (testResult === 'success') {
      testMessage = '<p style="color: green;">Webshare login successful!</p>';
  } else if (testResult === 'fail') {
      testMessage = '<p style="color: red;">Webshare login failed. Check credentials.</p>';
  }


  let rowsHtml = '';
  users.forEach(u => {
    const userTokens = tokens.filter(t => t.username === u.username);
    if (userTokens.length === 0) {
        const exp = new Date(u.expiresAt).toLocaleString();
         rowsHtml += `<tr><td>${u.username}</td><td>${exp}</td><td colspan="4">No devices</td></tr>`;
    } else {
        userTokens.forEach(tkn => {
          const exp = new Date(u.expiresAt).toLocaleString();
          const url = `${protocol}://${host}/${tkn.token}/${tkn.deviceId}/manifest.json`;
          rowsHtml += `
            <tr>
              <td>${u.username}</td>
              <td>${exp}</td>
              <td>${tkn.deviceId}</td>
              <td>${tkn.wst ? 'Ano' : 'Ne'}</td>
              <td><a href="${url}" target="_blank">Install URL</a></td>
              <td>
                 <form style="display:inline" method="POST" action="/admin/revoke"><input type="hidden" name="username" value="${u.username}"><input type="hidden" name="deviceMac" value="${tkn.deviceId}"><button>Revoke</button></form>
                 <form style="display:inline" method="POST" action="/admin/reset"><input type="hidden" name="username"  value="${u.username}"><input type="number" name="daysValid" min="1" placeholder="Days" required><button>Reset</button></form>
              </td>
            </tr>`;
        });
    }
  });

  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>Admin Dashboard</title><style>body{font-family:sans-serif;max-width:1100px;margin:auto;} table{width:100%; border-collapse: collapse;} th,td{border:1px solid #ccc; padding: 8px; text-align:left;} form{margin-bottom:2em;}</style></head>
    <body>
      <h1>Webshare Addon - Admin</h1>
      <h2>Register New User / Add Device</h2>
      <form method="POST" action="/admin/add">
        <label>Addon Username:<br><input name="username" required></label><br>
        <label>Addon Password:<br><input type="password" name="password" required></label><br>
        <label>Device MAC:<br><input name="deviceMac" required placeholder="AA:BB:CC:DD:EE:FF"></label><br>
        <label>Days Valid:<br><input name="daysValid" type="number" min="1" required></label><br>
        <hr>
        <h3>Webshare Credentials (Optional)</h3>
        <label>Webshare Username:<br><input name="wsUser"></label><br>
        <label>Webshare Password:<br><input type="password" name="wsPass"></label><br>
        <button>Create / Add Device</button>
      </form>
      <hr>
      <h2>Test Webshare Credentials</h2>
      ${testMessage}
      <form method="POST" action="/admin/test-ws">
        <label>Webshare Username:<br><input name="wsUser" required></label><br>
        <label>Webshare Password:<br><input type="password" name="wsPass" required></label><br>
        <button>Test Login</button>
      </form>
      <h2>Existing Users & Devices</h2>
      <table><tr><th>User</th><th>Expires</th><th>Device MAC</th><th>Webshare?</th><th>Install Link</th><th>Actions</th></tr>${rowsHtml}</table>
    </body></html>`;

  res.send(html);
});

// —— ADMINISTRAČNÍ AKCE ——
app.post('/admin/add', adminAuth, async (req, res) => {
    const { username, password, daysValid, deviceMac, wsUser, wsPass } = req.body;
    if (!username || !password || !daysValid || !deviceMac) return res.status(400).send('All fields required');
    if (!MAC_REGEX.test(deviceMac)) return res.status(400).send('Bad MAC format');

    let user = await User.findOne({ username });
    if (!user) {
        const hash = await bcrypt.hash(password, 10);
        user = await User.create({ username, hash, expiresAt: calcExpiry(+daysValid) });
    }

    const wst = await getWst(wsUser, wsPass);
    const token = uuidv4();
    await Token.create({ username, token, deviceId: deviceMac, wst });

    res.redirect('/admin');
});

app.post('/admin/test-ws', adminAuth, async (req, res) => {
    const { wsUser, wsPass } = req.body;
    const wst = await getWst(wsUser, wsPass);
    if (wst) {
        res.redirect('/admin?ws_test=success');
    } else {
        res.redirect('/admin?ws_test=fail');
    }
});

app.post('/admin/revoke', adminAuth, async (req, res) => {
  const { username, deviceMac } = req.body;
  await Token.deleteOne({ username, deviceId: deviceMac });
  res.redirect('/admin');
});
app.post('/admin/reset', adminAuth, async (req, res) => {
  const { username, daysValid } = req.body;
  if (!daysValid) return res.status(400).send('Days required');
  await User.findOneAndUpdate({ username }, { expiresAt: calcExpiry(+daysValid) });
  res.redirect('/admin');
});

// —— ROUTER DOPLŇKU ——
const addonRouter = getRouter(addonInterface);

app.use(MOUNT_PATH, async (req, res, next) => {
    const { token, deviceMac } = req.params;
    if (!MAC_REGEX.test(deviceMac)) return res.status(400).end('Bad MAC format');

    const entry = await Token.findOne({ token, deviceId: deviceMac });
    if (!entry) return res.status(401).end('Invalid token/device');

    const user = await User.findOne({ username: entry.username });
    if (!user || Date.now() > user.expiresAt) return res.status(403).end('Account expired or user not found');
    
    // Předáme WST do handleru v addon.js přes config
    if (entry.wst) {
        req.params.config = JSON.stringify({ wstToken: entry.wst });
    }
    
    next();
}, addonRouter);

module.exports = app;
