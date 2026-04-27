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
  const qrUrl = `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(receiptUrl || CONFIG.SITE_URL)}`;

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
  .btn { display: inline-block; background: #111827; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin: 16px 0; }
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
          <span class="stop-time">${booking.departure || ''}</span>
          <span class="stop-day">${booking.date}</span>
          <div class="stop-city">${(booking.boarding || '').split('(')[0].trim()}</div>
        </div>
        <div>
          <div class="stop-label">Прибуття</div>
          <span class="stop-time">${booking.arrivalTime || '—'}</span>
          <span class="stop-day">${booking.date}</span>
          <div class="stop-city">${(booking.exit || '').split('(')[0].trim()}</div>
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
  <div style="text-align:center;padding:0 28px 20px">
    <a href="${receiptUrl || CONFIG.SITE_URL}" class="btn">🧾 Переглянути фіскальний чек</a>
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

// ===== API: Підпис для WayForPay =====
app.post('/api/wfp-sign', (req, res) => {
  try {
    const { booking } = req.body;
    if (!booking) return res.status(400).json({ error: 'No booking data' });

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

    // Спочатку шукаємо в пам'яті, якщо немає — використовуємо дані з WayForPay callback
    let booking = pendingBookings[data.orderReference];
    
    if (!booking) {
      console.log('Booking not in memory, using WFP callback data for:', data.orderReference);
      // Формуємо мінімальне бронювання з даних callback
      booking = {
        id: data.orderReference,
        name: data.clientName || (data.clientFirstName ? `${data.clientFirstName} ${data.clientLastName || ''}`.trim() : 'Пасажир'),
        phone: data.phone || data.clientPhone || '—',
        email: data.email || data.clientEmail || '',
        route: data.productName ? (Array.isArray(data.productName) ? data.productName[0] : data.productName).replace('Квиток ', '') : '—',
        total: data.amount || '—',
        date: '—',
        departure: '—',
        boarding: '—',
        exit: '—',
        pax: 1,
      };
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
    await sendTelegram(
      `✅ *ОПЛАТА ОТРИМАНА!*

` +
      `👤 *Пасажир:* ${booking.name}
` +
      `📞 *Телефон:* ${booking.phone}
` +
      `📧 *Email:* ${booking.email || '—'}

` +
      `🗺 *Маршрут:* ${booking.route}
` +
      `📍 *Посадка:* ${booking.boarding}
` +
      `📍 *Висадка:* ${booking.exit}
` +
      `🕐 *Рейс:* ${booking.departure}
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
