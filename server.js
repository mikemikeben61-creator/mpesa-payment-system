const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serves index.html, style.css, app.js

// 1. Generate Safaricom Access Token Middleware
async function getAccessToken(req, res, next) {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { headers: { authorization: `Basic ${auth}` } }
        );
        req.token = response.data.access_token;
        next();
    } catch (error) {
        console.error('Error generating token:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to generate token' });
    }
}

// 2. STK Push Request Route (Triggers prompt on phone)
app.post('/api/stkpush', getAccessToken, async (req, res) => {
    const phone = req.body.phone;
    const amount = req.body.amount;

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
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
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
                AccountReference: 'WEBPAY',
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

// 3. M-Pesa Callback Route (Receives response when user enters PIN)
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
    } else {
        console.log(`\n❌ Payment failed or cancelled by user.`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// 4. Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});