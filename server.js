const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Send mail
const nodemailer = require('nodemailer');
app.post('/api/send_mail', async (req, res) => {
  const { subject, content, sender, senderName, sender_name } = req.body || {};
  if (!subject || !content) {
    return res.status(400).json({ error: 'missing subject or content' });
  }
  const displayName = sender || senderName || sender_name || 'AI Companion';
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE
    }
  });
  try {
    const info = await transporter.sendMail({
      from: `"${displayName}" <${process.env.QQ_EMAIL}>`,
      to: process.env.TO_EMAIL || process.env.QQ_EMAIL,
      subject: subject,
      text: content
    });
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Check mail
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
app.post('/api/check_mail', async (req, res) => {
  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE
    },
    logger: false
  });
  try {
    await client.connect();
    let lock = await client.getMailboxLock('INBOX');
    let messages = [];
    try {
      let searchResult = await client.search({ unseen: true });
      if (searchResult && searchResult.length > 0) {
        let targetSeq = searchResult.slice(-3);
        let range = targetSeq.join(',');
        for await (let message of client.fetch(range, { envelope: true, source: true })) {
          let parsed = await simpleParser(message.source);
          messages.push({
            subject: message.envelope.subject || 'no subject',
            from: message.envelope.from?.[0]?.address || 'unknown',
            date: message.envelope.date,
            content: (parsed.text || '').trim().slice(0, 500)
          });
        }
        messages.reverse();
        await client.messageFlagsAdd(range, ['\\Seen']);
      }
    } finally {
      lock.release();
    }
    await client.logout();
    if (messages.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        emails: [],
        notice: 'no unread emails'
      });
    }
    return res.status(200).json({ success: true, count: messages.length, emails: messages });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'email-mcp-api' });
});

app.listen(PORT, () => {
  console.log(`email-mcp-api running on port ${PORT}`);
});
