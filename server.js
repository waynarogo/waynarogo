const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
 
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
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
  SITE_URL:       process.env.SITE_URL || 'https://coruscating-cajeta-ed9e2c.netlify.app',
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
 
// ===== HMAC-MD5 підпис для Way4Pay =====
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
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}
 
// ===== EMAIL =====
async function sendEmail(to, subject, html) {
  if (!CONFIG.GMAIL_USER || !CONFIG.GMAIL_PASS) {
    console.log('Email not configured, skipping');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: CONFIG.GMAIL_USER, pass: CONFIG.GMAIL_PASS },
    });
    await transporter.sendMail({ from: CONFIG.GMAIL_USER, to, subject, html });
    console.log('Email sent to', to);
  } catch (e) {
    console.error('Email error:', e.message);
  }
}
 
// ===== CHECKBOX — отримати токен касира =====
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
 
// ===== CHECKBOX — створити фіскальний чек =====
async function createCheckboxReceipt(token, amount, description, email) {
  try {
    const amountKop = Math.round(amount * 100);
    const body = {
      goods: [{
        good: {
          code: '1',
          name: description,
          price: amountKop,
        },
        quantity: 1000,
        is_return: false,
      }],
      payments: [{
        type: 'CASHLESS',
        value: amountKop,
      }],
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
  const qrUrl = receiptUrl
    ? `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(receiptUrl)}`
    : `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(CONFIG.SITE_URL)}`;
 
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
  .qr-row { padding: 0 28px 20px; text-align: center; }
  .qr-label { font-size: 10px; color: #9ca3af; margin-top: 6px; }
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
          <span class="stop-time">${booking.departure || ''}</span>
          <span class="stop-day">${booking.date}</span>
          <div class="stop-city">${(booking.boarding || '').split('(')[0].trim()}</div>
          <div class="stop-addr">${booking.boardingAddr || ''}</div>
        </div>
        <div>
          <div class="stop-label">Прибуття</div>
          <span class="stop-time">${booking.arrivalTime || '—'}</span>
          <span class="stop-day">${booking.date}</span>
          <div class="stop-city">${(booking.exit || '').split('(')[0].trim()}</div>
          <div class="stop-addr">${booking.exitAddr || ''}</div>
        </div>
      </div>
      <div class="qr-row" style="padding:0;min-width:110px;text-align:center">
        <img src="${qrUrl}" width="110" height="110" alt="QR">
        <div class="qr-label">Фіскальний чек</div>
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
      <div class="info-label">Маршрут автобуса</div>
      <div class="info-value" style="font-size:12px">м. Білгород-Дністровський → м. Одеса → м. Київ</div>
    </div>
    <div class="info-row">
      <div><div class="info-label">Перевізник</div><div class="info-sub">м. Дніпро · +38 093 735 20 15</div></div>
      <div class="info-value" style="font-size:12px">ФОП Прус Олена Миколаївна</div>
    </div>
    <div class="info-row">
      <div class="info-label">Кількість пасажирів</div>
      <div class="info-value">${booking.pax || 1}</div>
    </div>
    <div class="info-row">
      <div><div class="info-label">Вартість</div><div class="info-sub">Оплата карткою · ${now}</div></div>
      <div class="info-value amount">${booking.total} грн</div>
    </div>
  </div>
 
  <div class="footer">
    <div class="footer-thanks">Дякуємо, що скористались нашим сайтом!</div>
    <div class="footer-site">waynarogo.com</div>
    <div class="footer-support">Служба підтримки: +38 093 735 20 15 · Щодня 9:00 — 21:00</div>
  </div>
 
  <div class="refund">
    <div class="refund-title">Умови повернення квитка</div>
    <div class="refund-item">· Більше ніж за 48 год — повернення 100%</div>
    <div class="refund-item">· Від 24 до 48 год — повернення 75%</div>
    <div class="refund-item">· Від 12 до 24 год — повернення 50%</div>
    <div class="refund-item">· Менше ніж за 12 год — кошти не повертаються</div>
  </div>
</div>
</body>
</html>`;
}
 
// ===== МАРШРУТ: Генерація підпису для Way4Pay =====
app.post('/api/wfp-sign', async (req, res) => {
  try {
    const { booking } = req.body;
    if (!booking) return res.status(400).json({ error: 'No booking data' });
 
    const orderRef  = booking.id;
    const amount    = booking.total;
    const orderDate = Math.floor(Date.now() / 1000);
    const domain    = new URL(CONFIG.SITE_URL).hostname;
    const productName = `Квиток ${booking.route}`;
 
    const signFields = [
      CONFIG.WFP_MERCHANT, domain, orderRef, orderDate,
      amount, 'UAH', productName, 1, amount
    ];
    const signature = wfpSign(signFields);
 
    res.json({
      merchantAccount:    CONFIG.WFP_MERCHANT,
      merchantDomainName: domain,
      orderReference:     orderRef,
      orderDate:          orderDate,
      amount:             amount,
      currency:           'UAH',
      productName:        productName,
      productPrice:       amount,
      productCount:       1,
      clientFirstName:    booking.name.split(' ')[0] || '',
      clientLastName:     booking.name.split(' ')[1] || '',
      clientPhone:        booking.phone,
      clientEmail:        booking.email || '',
      language:           'UA',
      returnUrl:          CONFIG.SITE_URL,
      serviceUrl:         `${process.env.SERVER_URL || 'https://your-server.onrender.com'}/api/wfp-callback`,
      merchantSignature:  signature,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});
 
// ===== МАРШРУТ: Callback від Way4Pay після оплати =====
app.post('/api/wfp-callback', async (req, res) => {
  try {
    const data = req.body;
    console.log('WFP Callback:', JSON.stringify(data));
 
    if (data.transactionStatus !== 'Approved') {
      return res.json({ status: 'ok' });
    }
 
    // Отримуємо дані бронювання (збережені на сервері)
    const booking = pendingBookings[data.orderReference];
    if (!booking) {
      console.log('Booking not found:', data.orderReference);
      return res.json({ status: 'ok' });
    }
 
    const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
 
    // 1. Створюємо фіскальний чек в Checkbox
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
        console.log('Checkbox receipt created:', receiptUrl);
      }
    }
 
    // 2. Надсилаємо квиток на email
    if (booking.email) {
      const ticketHtml = generateTicketHTML(booking, receiptUrl);
      await sendEmail(
        booking.email,
        `🎫 Ваш квиток WaynaroGo № ${booking.id}`,
        ticketHtml
      );
    }
 
    // 3. Telegram повідомлення
    await sendTelegram(
      `✅ *ОПЛАТА ОТРИМАНА!*\n\n` +
      `👤 *Пасажир:* ${booking.name}\n` +
      `📞 *Телефон:* ${booking.phone}\n\n` +
      `🗺 *Маршрут:* ${booking.route}\n` +
      `📍 *Посадка:* ${booking.boarding}\n` +
      `📍 *Висадка:* ${booking.exit}\n` +
      `🕐 *Рейс:* ${booking.departure}\n` +
      `📅 *Дата поїздки:* ${booking.date}\n` +
      `👥 *Пасажирів:* ${booking.pax}\n` +
      `💰 *Сума:* ${data.amount || booking.total} грн\n` +
      `🆔 *№ квитка:* ${booking.id}\n\n` +
      `🕒 *Оформлено:* ${booking.created}\n` +
      `✅ *Оплачено:* ${now}\n` +
      (receiptUrl ? `🧾 *Фіскальний чек:* ${receiptUrl}` : '')
    );
 
    delete pendingBookings[data.orderReference];
    res.json({ status: 'ok' });
  } catch (e) {
    console.error('Callback error:', e);
    res.status(500).json({ error: e.message });
  }
});
 
// ===== МАРШРУТ: Зберегти бронювання =====
const pendingBookings = {};
 
app.post('/api/booking', async (req, res) => {
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
 
// ===== HEALTH CHECK =====
app.get('/', (req, res) => res.send('WaynaroGo Server OK'));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
 
