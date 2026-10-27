'use strict';
// The responsible-use agreement every installation must sign before the web
// mail can be used. Bump VERSION when the wording changes materially: everyone
// is then asked to sign again.
const VERSION = 1;

const terms = isp => [
  { h: 'You are responsible for this server', p: 'You run this mail server on your own machine and internet connection. You alone are responsible for every message sent or received through it, for who can use it, and for keeping it secure — a strong password, updates, and not sharing access.' },
  { h: 'No spam or abuse', p: 'You will not use it to send spam, bulk or unsolicited mail, phishing, scams, malware, harassment or threats, or anything illegal where you live or where the mail is going. That includes letting anyone else do so through your server.' },
  { h: `Your internet provider: ${isp}`, p: `Your connection comes from ${isp}, and you must follow ${isp}’s terms of service. Many home internet plans limit running servers or sending mail directly. If abuse is reported from your address, ${isp} can warn you, block mail ports, slow, suspend or end your service, and your address can end up on blocklists that other mail providers use. Any such conflict is between you and ${isp}.` },
  { h: 'Mail providers can refuse your mail', p: 'Gmail, Outlook and others decide for themselves whether to accept mail from your server. selfmail cannot guarantee delivery, and blocked, delayed or lost mail is not something its authors can be held responsible for.' },
  { h: 'No warranty, no liability', p: 'selfmail is free, open-source software provided “as is”, without any warranty (MIT License). Its authors and contributors are not responsible or liable for how you use it, or for any damage, data loss, costs, account actions, or disputes — with your internet provider, mail providers or anyone else — that result from running it.' },
  { h: 'If you are under 18', p: 'Ask a parent or guardian to read this with you before you agree.' },
];

module.exports = { VERSION, terms };
