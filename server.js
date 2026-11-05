const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Determine Environment (sandbox or production)
const MPESA_ENV = process.env.MPESA_ENV || 'sandbox';
const BASE_URL = MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// 1. Generate Safaricom Access Token Middleware
async function getAccessToken(req, res, next) {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
        const response = await axios.get(
            `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
            { headers: { authorization: `Basic ${auth}` } }
        );
        req.token = response.data.access_token;
        next();
    } catch (error) {
        console.error('Error generating token:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to generate token' });
    }
}

// 2. STK Push Request Route
app.post('/api/stkpush', getAccessToken, async (req, res) => {
    let { phone, amount } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: 'Phone number and amount are required' });
    }

    // Sanitize phone number format to 2547XXXXXXXX
    phone = phone.toString().trim();
    if (phone.startsWith('0')) {
        phone = '254' + phone.slice(1);
    } else if (phone.startsWith('+')) {
        phone = phone.slice(1);
    }

    const date = new Date();
    const timestamp = date.getFullYear() +
        ('0' + (date.getMonth() + 1)).slice(-2) +
        ('0' + date.getDate()).slice(-2) +
        ('0' + date.getHours()).slice(-2) +
        ('0' + date.getMinutes()).slice(-2) +
        ('0' + date.getSeconds()).slice(-2);

    const shortCode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');

    try {
        const response = await axios.post(
            `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
            {
                BusinessShortCode: shortCode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: amount,
                PartyA: phone,
                PartyB: shortCode,
                PhoneNumber: phone,
                CallBackURL: process.env.MPESA_CALLBACK_URL,
                AccountReference: process.env.MPESA_ACCOUNT_REF || 'WEBPAY',
                TransactionDesc: 'Web Payment'
            },
            {
                headers: { Authorization: `Bearer ${req.token}` }
            }
        );
        res.status(200).json(response.data);
    } catch (error) {
        console.error('STK Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || 'Failed to process request' });
    }
});

// 3. M-Pesa Callback Route
app.post('/api/mpesa/callback', (req, res) => {
    console.log('\n====================================');
    console.log('📬 M-PESA CALLBACK RECEIVED FROM SAFARICOM!');
    console.log('====================================');
    console.log(JSON.stringify(req.body, null, 2));

    const callbackData = req.body.Body?.stkCallback;

    if (callbackData && callbackData.ResultCode === 0) {
        const items = callbackData.CallbackMetadata.Item;
        const amount = items.find(item => item.Name === 'Amount')?.Value;
        const mpesaReceiptNumber = items.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
        const phoneNumber = items.find(item => item.Name === 'PhoneNumber')?.Value;

        console.log(`\n✅ PAYMENT SUCCESSFUL!`);
        console.log(`💰 Amount: KSh ${amount}`);
        console.log(`🧾 Receipt: ${mpesaReceiptNumber}`);
        console.log(`📱 Phone: ${phoneNumber}\n`);
        
        // TODO: Update database order status here
    } else {
        console.log(`\n❌ Payment failed or cancelled by user.`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// 4. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [Mode: ${MPESA_ENV}]`);
});