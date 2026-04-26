const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
};app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

function wfpSign(fields) {
  const str = fields.join(';');
  return crypto.createHmac('md5', CONFIG.WFP_SECRET).update(str).digest('hex');
}

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

async function sendEmail(to, subject, html) {
  if (!CONFIG.GMAIL_USER || !CONFIG.GMAIL_PASS) return;
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: CONFIG.GMAIL_USER, pass: CONFIG.GMAIL_PASS },
    });
    await transporter.sendMail({ from: CONFIG.GMAIL_USER, to, subject, html });
  } catch (e) {
    console.error('Email error:', e.message);
  }
}

async function checkboxLogin() {
  try {
    const res = await axios.post('https://api.checkbox.ua/api/v1/cashier/signin', {
      login: CONFIG.CHECKBOX_LOGIN,
      password: CONFIG.CHECKBOX_PASS,
    }, { headers: { 'X-License-Key': CONFIG.CHECKBOX_KEY } });
    return res.data.access_token;
  } catch (e) {
    console.error('Checkbox login error:', e.message);
    return null;
  }
}async function createCheckboxReceipt(token, amount, description, email) {
  try {
    const amountKop = Math.round(amount * 100);
    const res = await axios.post('https://api.checkbox.ua/api/v1/receipts/sell', {
      goods: [{ good: { code: '1', name: description, price: amountKop }, quantity: 1000 }],
      payments: [{ type: 'CASHLESS', value: amountKop }],
      delivery: email ? { email } : undefined,
    }, { headers: { 'Authorization': `Bearer ${token}`, 'X-License-Key': CONFIG.CHECKBOX_KEY } });
    return res.data;
  } catch (e) {
    console.error('Checkbox error:', e.message);
    return null;
  }
}

const pendingBookings = {};

app.post('/api/booking', async (req, res) => {
  const { booking } = req.body;
  if (!booking) return res.status(400).json({ error: 'No booking' });
  pendingBookings[booking.id] = booking;
  res.json({ status: 'ok' });
});

app.post('/api/wfp-sign', async (req, res) => {
  const { booking } = req.body;
  if (!booking) return res.status(400).json({ error: 'No booking' });
  const orderDate = Math.floor(Date.now() / 1000);
  const domain = new URL(CONFIG.SITE_URL).hostname;
  const productName = `Квиток ${booking.route}`;
  const signature = wfpSign([CONFIG.WFP_MERCHANT, domain, booking.id, orderDate, booking.total, 'UAH', productName, 1, booking.total]);
  res.json({ merchantAccount: CONFIG.WFP_MERCHANT, merchantDomainName: domain, orderReference: booking.id, orderDate, amount: booking.total, currency: 'UAH', productName, productPrice: booking.total, productCount: 1, clientFirstName: booking.name.split(' ')[0] || '', clientLastName: booking.name.split(' ')[1] || '', clientPhone: booking.phone, clientEmail: booking.email || '', language: 'UA', returnUrl: CONFIG.SITE_URL, serviceUrl: `${process.env.SERVER_URL}/api/wfp-callback`, merchantSignature: signature });
});app.post('/api/wfp-callback', async (req, res) => {
  try {
    const data = req.body;
    if (data.transactionStatus !== 'Approved') return res.json({ status: 'ok' });
    const booking = pendingBookings[data.orderReference];
    if (!booking) return res.json({ status: 'ok' });
    const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
    let receiptUrl = null;
    const cbToken = await checkboxLogin();
    if (cbToken) {
      const receipt = await createCheckboxReceipt(cbToken, data.amount || booking.total, `Квиток ${booking.route}`, booking.email);
      if (receipt) receiptUrl = `https://receipt.checkbox.ua/${receipt.id}`;
    }
    if (booking.email) {
      await sendEmail(booking.email, `🎫 Ваш квиток WaynaroGo № ${booking.id}`, `<h2>Дякуємо за покупку!</h2><p>Маршрут: ${booking.route}</p><p>Дата: ${booking.date}</p><p>Пасажир: ${booking.name}</p><p>Сума: ${booking.total} грн</p>${receiptUrl ? `<p><a href="${receiptUrl}">Фіскальний чек</a></p>` : ''}`);
    }
    await sendTelegram(
      `✅ *ОПЛАТА ОТРИМАНА!*\n\n👤 *Пасажир:* ${booking.name}\n📞 *Телефон:* ${booking.phone}\n🗺 *Маршрут:* ${booking.route}\n📍 *Посадка:* ${booking.boarding}\n📍 *Висадка:* ${booking.exit}\n🕐 *Рейс:* ${booking.departure}\n📅 *Дата:* ${booking.date}\n👥 *Пасажирів:* ${booking.pax}\n💰 *Сума:* ${data.amount || booking.total} грн\n🆔 *№ квитка:* ${booking.id}\n\n🕒 *Оформлено:* ${booking.created}\n✅ *Оплачено:* ${now}${receiptUrl ? `\n🧾 *Чек:* ${receiptUrl}` : ''}`
    );
    delete pendingBookings[data.orderReference];
    res.json({ status: 'ok' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('WaynaroGo Server OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
