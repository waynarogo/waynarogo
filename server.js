const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();

// ===== НАЛАШТУВАННЯ =====
const CONFIG = {
  WFP_MERCHANT:   'elegant_paprenjak_8aa868_netlify_app1',
  WFP_SECRET:     '16d98f05acafb07290166956ccaba9af988a8416',
  TELEGRAM_TOKEN: '8632951199:AAFsWQPTOwehwGHpjphNjl7_1n-5PHzpvLc',
  TELEGRAM_CHAT:  '474685279',
  CHECKBOX_LOGIN: 'matsap93',
  CHECKBOX_PASS:  '8839685358',
  CHECKBOX_KEY:   '8bc597cc9b6f05ece7f4fbd9',
  GMAIL_USER:     process.env.GMAIL_USER || '',
  GMAIL_PASS:     process.env.GMAIL_PASS || '',
  SITE_URL:       'https://coruscating-cajeta-ed9e2c.netlify.app',
  SERVER_URL:     'https://waynarogo-server.onrender.com',
};


// ===== РОЗКЛАД ЗУПИНОК =====
const STOP_ADDRESSES = {
  "Білгород-Дністровський (Автовокзал)": "вул. Вокзальна, 2",
  "Старокозаче": "траса Е87 / М15",
  "Маяки": "вул. Радянської Армії",
  "Одеса (Автостанція Привокзальна)": "вул. Старосінна, 1Б",
  "Одеса (Зупинка тролейбусу №8)": "вул. Колонтаївська",
  "Криве Озеро": "траса М05",
  "Умань (Автовокзал)": "вул. Київська, 1",
  "Умань (АЗС Amic Energy)": "траса М05, АЗС AMIC Energy",
  "Біла Церква (На трасі, під мостом)": "вул. Леваневського, під мостом",
  "Київ (Метро Теремки)": "просп. Академіка Глушкова, 22",
  "Київ (Центральний автовокзал)": "просп. Науки, 1/2",
};

const ROUTES = {
  'r1': { // Ранній БД → Київ
    stops: [
      { name: "Білгород-Дністровський (Автовокзал)", depart: "05:40" },
      { name: "Старокозаче", depart: "06:00" },
      { name: "Маяки", depart: "06:20" },
      { name: "Одеса (Автостанція Привокзальна)", depart: "08:00" },
      { name: "Одеса (Зупинка тролейбусу №8)", depart: "08:15" },
      { name: "Криве Озеро", depart: "10:15" },
      { name: "Умань (Автовокзал)", arrive: "11:45", depart: "12:15" },
      { name: "Умань (АЗС Amic Energy)", depart: "12:25" },
      { name: "Біла Церква (На трасі, під мостом)", depart: "14:05" },
      { name: "Київ (Метро Теремки)", depart: "14:50" },
      { name: "Київ (Центральний автовокзал)", arrive: "15:00" },
    ]
  },
  'r3': { // Денний БД → Київ
    stops: [
      { name: "Білгород-Дністровський (Автовокзал)", depart: "11:00" },
      { name: "Старокозаче", depart: "11:20" },
      { name: "Маяки", depart: "11:35" },
      { name: "Одеса (Автостанція Привокзальна)", depart: "13:00" },
      { name: "Одеса (Зупинка тролейбусу №8)", depart: "13:15" },
      { name: "Криве Озеро", depart: "15:15" },
      { name: "Умань (Автовокзал)", arrive: "16:45", depart: "17:15" },
      { name: "Умань (АЗС Amic Energy)", depart: "17:25" },
      { name: "Біла Церква (На трасі, під мостом)", depart: "19:05" },
      { name: "Київ (Метро Теремки)", depart: "19:50" },
      { name: "Київ (Центральний автовокзал)", arrive: "20:00" },
    ]
  },
  'r5': { // Нічний БД → Київ
    stops: [
      { name: "Білгород-Дністровський (Автовокзал)", depart: "19:15" },
      { name: "Старокозаче", depart: "19:35" },
      { name: "Маяки", depart: "19:50" },
      { name: "Одеса (Автостанція Привокзальна)", depart: "21:15" },
      { name: "Одеса (Зупинка тролейбусу №8)", depart: "21:30" },
      { name: "Криве Озеро", depart: "23:30" },
      { name: "Умань (Автовокзал)", arrive: "01:00", depart: "01:30" },
      { name: "Умань (АЗС Amic Energy)", depart: "01:40" },
      { name: "Біла Церква (На трасі, під мостом)", depart: "03:20" },
      { name: "Київ (Метро Теремки)", depart: "04:05" },
      { name: "Київ (Центральний автовокзал)", arrive: "04:15" },
    ]
  },
};

function getStopTime(routeId, stopName, type) {
  const route = ROUTES[routeId];
  if (!route) return '';
  const stop = route.stops.find(s => s.name === stopName);
  if (!stop) return '';
  return type === 'arrive' ? (stop.arrive || stop.depart || '') : (stop.depart || stop.arrive || '');
}

function findRouteByBooking(booking) {
  const tripType = (booking.tripType || booking.route || '').toLowerCase();
  const isNight = tripType.includes('нічний') || tripType.includes('night');
  const isDay = tripType.includes('денний') || tripType.includes('day');
  const isEarly = tripType.includes('ранній') || tripType.includes('early');
  if (isNight) return 'r5';
  if (isDay) return 'r3';
  if (isEarly) return 'r1';
  return 'r5'; // default
}

// ===== CORS =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ type: '*/*' }));
app.use(express.urlencoded({ extended: true }));

// ===== HMAC-MD5 підпис для WayForPay =====
function wfpSign(fields) {
  const str = fields.join(';');
  return crypto.createHmac('md5', CONFIG.WFP_SECRET).update(str).digest('hex');
}

// ===== TELEGRAM =====
async function sendTelegram(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CONFIG.TELEGRAM_CHAT,
      text,
      parse_mode: 'Markdown',
    });
    console.log('Telegram sent OK');
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

// ===== EMAIL через Gmail =====
async function sendEmail(to, subject, html) {
  if (!CONFIG.GMAIL_USER || !CONFIG.GMAIL_PASS) {
    console.log('Email not configured — add GMAIL_USER and GMAIL_PASS in Render environment');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: CONFIG.GMAIL_USER, pass: CONFIG.GMAIL_PASS },
    });
    await transporter.sendMail({ from: `WaynaroGo <${CONFIG.GMAIL_USER}>`, to, subject, html });
    console.log('Email sent to', to);
  } catch (e) {
    console.error('Email error:', e.message);
  }
}

// ===== CHECKBOX — логін =====
async function checkboxLogin() {
  try {
    const res = await axios.post('https://api.checkbox.ua/api/v1/cashier/signin', {
      login: CONFIG.CHECKBOX_LOGIN,
      password: CONFIG.CHECKBOX_PASS,
    }, {
      headers: { 'X-License-Key': CONFIG.CHECKBOX_KEY, 'Content-Type': 'application/json' }
    });
    return res.data.access_token;
  } catch (e) {
    console.error('Checkbox login error:', e.message);
    return null;
  }
}

// ===== CHECKBOX — створити чек =====
async function createCheckboxReceipt(token, amount, description, email) {
  try {
    const amountKop = Math.round(amount * 100);
    const body = {
      goods: [{
        good: { code: '1', name: description, price: amountKop },
        quantity: 1000,
        is_return: false,
      }],
      payments: [{ type: 'CASHLESS', value: amountKop }],
      delivery: email ? { email } : undefined,
    };
    const res = await axios.post('https://api.checkbox.ua/api/v1/receipts/sell', body, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-License-Key': CONFIG.CHECKBOX_KEY,
        'Content-Type': 'application/json',
      }
    });
    return res.data;
  } catch (e) {
    console.error('Checkbox receipt error:', e.response?.data || e.message);
    return null;
  }
}

// ===== ГЕНЕРАЦІЯ HTML КВИТКА =====
function generateTicketHTML(booking, receiptUrl) {
  const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  
  // Знаходимо час і адреси зупинок
  const routeId = findRouteByBooking(booking);
  const departTime = booking.departure || getStopTime(routeId, booking.boarding, 'depart');
  const arrivalTime = booking.arrivalTime || getStopTime(routeId, booking.exit, 'arrive');
  const boardingAddr = STOP_ADDRESSES[booking.boarding] || '';
  const exitAddr = STOP_ADDRESSES[booking.exit] || '';

  // QR веде на квиток
  const ticketParams = new URLSearchParams({
    id: booking.id, name: booking.name, phone: booking.phone,
    route: booking.route, date: booking.date,
    departure: departTime, arrival: arrivalTime,
    boarding: booking.boarding, exit: booking.exit,
    pax: booking.pax, total: booking.total, paid_at: now,
  });
  const qrUrl = `https://chart.googleapis.com/chart?chs=120x120&cht=qr&chl=${encodeURIComponent(CONFIG.SITE_URL + '/ticket.html?' + ticketParams.toString())}&choe=UTF-8`;

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<title>Квиток ${booking.id}</title>
<style>
  body { font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px; margin: 0; }
  .ticket { background: white; max-width: 580px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
  .header { background: #111827; padding: 20px 28px; display: flex; justify-content: space-between; align-items: center; }
  .logo-text { color: white; font-size: 22px; font-weight: 700; }
  .logo-text span { color: #e8a020; }
  .ticket-num { text-align: right; color: #9ca3af; font-size: 12px; }
  .ticket-num strong { display: block; color: #e8a020; font-size: 14px; margin-top: 2px; }
  .route { padding: 24px 28px; }
  .stop-label { font-size: 10px; color: #9ca3af; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
  .stop-time { font-size: 22px; font-weight: 700; color: #111827; }
  .stop-day { font-size: 13px; color: #374151; margin-left: 8px; }
  .stop-city { font-size: 13px; font-weight: 600; color: #111827; margin-top: 4px; }
  .stop-addr { font-size: 11px; color: #9ca3af; }
  .dot-dep { width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid #2563a8; display: inline-block; margin-right: 10px; vertical-align: middle; }
  .dot-arr { width: 14px; height: 14px; border-radius: 50%; background: #e8a020; display: inline-block; margin-right: 10px; vertical-align: middle; }
  .divider { border: none; border-top: 1.5px dashed #e5e7eb; margin: 0 28px; }
  .info { padding: 20px 28px; }
  .info-row { padding: 10px 0; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: flex-start; }
  .info-row:last-child { border: none; }
  .info-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
  .info-value { font-size: 14px; font-weight: 600; color: #111827; text-align: right; }
  .info-sub { font-size: 12px; color: #6b7280; }
  .amount { font-size: 22px; font-weight: 700; }
  .footer { background: #f9fafb; border-top: 1.5px dashed #e5e7eb; padding: 18px 28px; text-align: center; }
  .footer-thanks { font-size: 14px; font-weight: 600; color: #111827; }
  .footer-site { color: #2563a8; font-size: 13px; }
  .footer-support { font-size: 12px; color: #6b7280; margin-top: 6px; }
  .refund { padding: 14px 28px; background: white; border-top: 1px solid #f3f4f6; }
  .refund-title { font-size: 10px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
  .refund-item { font-size: 10px; color: #9ca3af; line-height: 1.8; }
  .route-line { display: flex; align-items: flex-start; margin-bottom: 20px; gap: 12px; }
  .route-dots { display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 4px; }
  .vline { width: 1.5px; height: 30px; background: repeating-linear-gradient(to bottom, #e5e7eb 0, #e5e7eb 5px, transparent 5px, transparent 9px); }

</style>
</head>
<body>
<div class="ticket">
  <div class="header">
    <div class="logo-text">Waynaro<span>Go</span></div>
    <div class="ticket-num">
      Електронний квиток
      <strong>№ ${booking.id}</strong>
    </div>
  </div>
  <div class="route">
    <div class="route-line">
      <div class="route-dots">
        <div class="dot-dep"></div>
        <div class="vline"></div>
        <div class="dot-arr"></div>
      </div>
      <div style="flex:1">
        <div style="margin-bottom:18px">
          <div class="stop-label">Відправлення</div>
          <span class="stop-time">${departTime || '—'}</span>
          <span class="stop-day">${booking.date}</span>
          <div class="stop-city">${(booking.boarding || '').split('(')[0].trim()}</div>
          <div class="stop-addr">${boardingAddr}</div>
        </div>
        <div>
          <div class="stop-label">Прибуття</div>
          <span class="stop-time">${arrivalTime || '—'}</span>
          <span class="stop-day">${booking.date}</span>
          <div class="stop-city">${(booking.exit || '').split('(')[0].trim()}</div>
          <div class="stop-addr">${exitAddr}</div>
        </div>
      </div>
      <div style="text-align:center;min-width:110px">
        <img src="${qrUrl}" width="110" height="110" alt="QR">
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">Фіскальний чек</div>
      </div>
    </div>
  </div>
  <hr class="divider">
  <div class="info">
    <div class="info-row">
      <div><div class="info-label">Пасажир</div><div class="info-sub">${booking.phone}</div></div>
      <div class="info-value">${booking.name}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Маршрут</div>
      <div class="info-value" style="font-size:12px">м. Білгород-Дністровський → м. Одеса → м. Київ</div>
    </div>
    <div class="info-row">
      <div><div class="info-label">Перевізник</div></div>
      <div class="info-value" style="font-size:12px">ФОП Прус Олена Миколаївна</div>
    </div>
    <div class="info-row">
      <div class="info-label">Пасажирів</div>
      <div class="info-value">${booking.pax || 1}</div>
    </div>
    <div class="info-row">
      <div><div class="info-label">Вартість</div><div class="info-sub">Оплата карткою · ${now}</div></div>
      <div class="info-value amount">${booking.total} грн</div>
    </div>
  </div>
  <div style="text-align:center;padding:12px 28px;font-size:12px;color:#6b7280">
    🧾 Фіскальний чек надіслано на вашу email від WayForPay
  </div>
  <div class="footer">
    <div class="footer-thanks">Дякуємо, що скористались нашим сайтом!</div>
    <div class="footer-site">waynarogo.com</div>
    <div class="footer-support">Служба підтримки: +38 093 735 20 15 · Щодня 9:00 — 21:00</div>
  </div>
  <div class="refund">
    <div class="refund-title">Умови повернення</div>
    <div class="refund-item">· Більше ніж за 48 год — повернення 100%</div>
    <div class="refund-item">· Від 24 до 48 год — повернення 75%</div>
    <div class="refund-item">· Від 12 до 24 год — повернення 50%</div>
    <div class="refund-item">· Менше ніж за 12 год — кошти не повертаються</div>
  </div>
</div>
</body>
</html>`;
}

// ===== ЗБЕРІГАННЯ БРОНЮВАНЬ =====
const pendingBookings = {};

// ===== API: Зберегти бронювання =====
app.post('/api/booking', (req, res) => {
  try {
    const { booking } = req.body;
    if (!booking) return res.status(400).json({ error: 'No booking' });
    pendingBookings[booking.id] = booking;
    console.log('Booking saved:', booking.id);
    res.json({ status: 'ok', id: booking.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== API: Підпис для WayForPay + зберігаємо бронювання =====
app.post('/api/wfp-sign', (req, res) => {
  try {
    const { booking } = req.body;
    if (!booking) return res.status(400).json({ error: 'No booking data' });

    // Зберігаємо бронювання в пам'яті сервера
    pendingBookings[booking.id] = booking;
    console.log('Booking saved:', booking.id, booking.name, booking.route);

    const orderDate   = Math.floor(Date.now() / 1000);
    const domain      = 'coruscating-cajeta-ed9e2c.netlify.app';
    const productName = `Квиток ${booking.route}`;

    const signature = wfpSign([
      CONFIG.WFP_MERCHANT, domain, booking.id,
      orderDate, booking.total, 'UAH',
      productName, 1, booking.total
    ]);

    res.json({
      merchantAccount:    CONFIG.WFP_MERCHANT,
      merchantDomainName: domain,
      orderReference:     booking.id,
      orderDate,
      amount:             booking.total,
      currency:           'UAH',
      productName,
      productPrice:       booking.total,
      productCount:       1,
      clientFirstName:    booking.name.split(' ')[0] || '',
      clientLastName:     booking.name.split(' ')[1] || '',
      clientPhone:        booking.phone,
      clientEmail:        booking.email || '',
      language:           'UA',
      returnUrl:          `${CONFIG.SITE_URL}/success.html`,
      serviceUrl:         `${CONFIG.SERVER_URL}/api/wfp-callback`,
      merchantSignature:  signature,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== API: Callback від WayForPay після оплати =====
app.post('/api/wfp-callback', async (req, res) => {
  try {
    const data = req.body;
    console.log('WFP Callback received:', JSON.stringify(data));

    // Відповідаємо WayForPay одразу
    res.json({ status: 'ok' });

    if (data.transactionStatus !== 'Approved') {
      console.log('Payment not approved:', data.transactionStatus);
      return;
    }

    // Шукаємо бронювання в пам'яті сервера
    let booking = pendingBookings[data.orderReference];
    
    if (!booking) {
      console.log('Booking not in memory, skipping old callback for:', data.orderReference);
      // Не надсилаємо повідомлення для старих транзакцій без даних
      return;
    }

    const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

    // 1. Checkbox фіскальний чек
    let receiptUrl = null;
    const cbToken = await checkboxLogin();
    if (cbToken) {
      const receipt = await createCheckboxReceipt(
        cbToken,
        data.amount || booking.total,
        `Квиток ${booking.route}`,
        booking.email
      );
      if (receipt) {
        receiptUrl = `https://receipt.checkbox.ua/${receipt.id}`;
        console.log('Checkbox receipt:', receiptUrl);
      }
    }

    // 2. Email з квитком
    if (booking.email) {
      const ticketHtml = generateTicketHTML(booking, receiptUrl);
      await sendEmail(
        booking.email,
        `🎫 Ваш квиток WaynaroGo № ${booking.id}`,
        ticketHtml
      );
    }

    // 3. Telegram
    const fullRoute = `м. Білгород-Дністровський → м. Київ (${booking.tripType || booking.route})`;
    await sendTelegram(
      `✅ *ОПЛАТА ОТРИМАНА!*

` +
      `👤 *Пасажир:* ${booking.name}
` +
      `📞 *Телефон:* ${booking.phone}
` +
      `📧 *Email:* ${booking.email || '—'}

` +
      `🗺 *Маршрут:* ${fullRoute}
` +
      `📍 *Посадка:* ${booking.boarding}
` +
      `📍 *Висадка:* ${booking.exit}
` +
      `🕐 *Рейс:* ${booking.departure || '—'}
` +
      `📅 *Дата:* ${booking.date}
` +
      `👥 *Пасажирів:* ${booking.pax}
` +
      `💰 *Сума:* ${data.amount || booking.total} грн
` +
      `🆔 *№ квитка:* ${booking.id}

` +
      `✅ *Оплачено:* ${now}
` +
      (receiptUrl ? `🧾 *Чек:* ${receiptUrl}` : '')
    );

    delete pendingBookings[data.orderReference];
  } catch (e) {
    console.error('Callback error:', e);
  }
});

// ===== HEALTH CHECK =====
app.get('/', (req, res) => res.send('WaynaroGo Server OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
