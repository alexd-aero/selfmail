# selfmail

A self-hosted mail server with a web interface, built for machines that **cannot open port 25** — home servers, Raspberry Pis, anything behind NAT you don't control.

One script installs and configures Postfix, OpenDKIM and a web UI. The UI tells you exactly which DNS records to create and verifies them for you with a single button.

```bash
git clone https://github.com/alexd-aero/selfmail.git
cd selfmail
sudo ./setup.sh
```

---

## The problem this solves

Self-hosting outbound mail is easy. Self-hosting *inbound* mail is where people get stuck, and it usually comes down to one hard fact:

> **MX records carry no port number.** Every sending mail server in the world resolves your MX and connects to **TCP 25** of that host. There is no way to say "deliver to port 2525" in DNS.

So if your ISP or router won't give you inbound port 25, no tunnel service can rescue you — ngrok and bore hand out random high ports, Cloudflare Tunnel doesn't proxy SMTP, and Tailscale Funnel only exposes 443/8443/10000. None of them can be an MX.

selfmail offers two ways to run:

| Mode | How inbound works | Needs port 25 inbound? |
|---|---|---|
| **relay** (default) | A free relay accepts mail on *its* port 25 and POSTs each message to a public HTTPS URL for your server. | **No** |
| **direct** | Your host owns port 25 and receives mail itself. | Yes |

Relay mode is the point of this project. Something must own port 25 — it just doesn't have to be you.

```
sender ──▶ relay MX (port 25) ──▶ HTTPS POST ──▶ your tunnel ──▶ selfmail ──▶ Maildir
```

Because the tunnel connection is outbound-initiated, your router is never involved.

---

## Requirements

- A Linux host with systemd (Debian/Ubuntu or RHEL/Fedora — the installer handles `apt`, `dnf` and `yum`)
- Node.js 18+ (installed automatically if your distro packages it)
- Root access
- A domain whose DNS you control
- **Outbound** port 25 must not be blocked by your ISP, or you cannot send at all. Check first:
  ```bash
  timeout 8 bash -c 'exec 3<>/dev/tcp/gmail-smtp-in.l.google.com/25' && echo open || echo BLOCKED
  ```
- For relay mode: a public HTTPS URL. **The installer can build one for you** — it downloads `cloudflared`, asks you to approve a Cloudflare sign-in in your browser, then publishes a permanent hostname and keeps it alive. No port forwarding. You can also supply your own URL instead.

---

## Install

`setup.sh` asks for your mail domain, hostname, mailbox name, inbound mode and a web password, then:

- installs and configures Postfix as a virtual-mailbox host for your domain
- generates a 2048-bit DKIM key and wires OpenDKIM in as a milter
- creates an unprivileged `vmail` user and Maildir storage
- installs the web UI as a systemd service with `Restart=always`
- optionally builds a Cloudflare Tunnel, plus a watchdog timer that re-checks the public URL every 2 minutes and restarts the tunnel if it stops answering (a hung tunnel keeps its process alive, so systemd alone cannot catch it)
- pins outbound SMTP to IPv4 (see [Deliverability](#deliverability))
- grants the app a **narrow** sudo allowlist — specific commands only, never blanket root

Everything it writes lives in `/etc/selfmail`, `/opt/selfmail` and `/var/mail/vhosts`. Your existing `main.cf` is backed up to `main.cf.selfmail-backup`.

## Day-to-day

```bash
sudo ./run.sh      # start everything, print the local and public URLs
sudo ./kill.sh     # stop selfmail and the tunnel (add --all to stop postfix too)
sudo ./update.sh   # pull latest, install over the running copy, restart
sudo ./relay.sh    # send outbound through an SMTP relay (fixes deliverability)
```

`update.sh` pulls, copies the new code into `/opt/selfmail`, refreshes
dependencies, clears anything squatting on port 25 and restarts everything.
Your config, DKIM key, mailboxes and tunnel are untouched. It removes itself
when it finishes; `git checkout -- update.sh` brings it back.

## DNS

Open the web UI, go to the **DNS** tab. It lists every record with its exact name and value, generated from your live configuration rather than a template. Add them at your DNS host, then press **Check records** — it resolves each one against public DNS and shows what's missing, what's wrong, and what it actually found.

You'll always need an `A` record, an `MX`, plus `TXT` records for SPF, DKIM and DMARC. Relay mode adds one more TXT telling the relay where to deliver — if the installer built your tunnel, that record arrives **already filled in** with the real hostname and secret, ready to paste.

> On Cloudflare, the `A` record for your mail host **must be grey-cloud / "DNS only"**. Proxying replaces your IP with Cloudflare's and SPF fails immediately.

---

## Deliverability

Being blunt about this, because it's the part most guides gloss over.

Getting SPF, DKIM and DMARC to pass is straightforward and this project does it for you. What you **cannot** fix from a residential connection is **reverse DNS**. Mail providers check that your sending IP has a PTR record which forward-confirms — resolves back to a hostname that resolves to that same IP. Consumer ISPs point your PTR at something like `203-0-113-45.example-isp.net`, which usually has no A record, so the check fails:

```
SPF check:    pass
DKIM check:   pass
iprev check:  fail (no matching DNS records found)
```

That's a real report from a residential connection with everything configured correctly. Combined with a residential IP range and a brand-new domain with no sending reputation, expect Gmail to file your mail as spam at first.

What actually helps:

- Have recipients mark the message **Not spam** and add you to their contacts. Engagement is the strongest reputation signal available to you.
- Send real, varied, low-volume mail. Short "test" messages score badly on their own.
- Give it time — reputation accrues over days and weeks.
- **Run `sudo ./relay.sh`.** This is the only reliable fix and it is built in. Outbound goes through an SMTP provider that has proper reverse DNS and a sending reputation, while you keep receiving on your own hardware. Mail is still from your domain and still signed with your DKIM key. Free tiers (Brevo 300/day, SMTP2GO 1000/month, Resend 3000/month) cover personal use.

Measured on a real residential connection, sending direct:

```
to outlook.com:  550 5.7.1 Service unavailable, Client host [x.x.x.x]
                 blocked using Spamhaus
to gmail.com:    accepted, filed as spam
```

Microsoft **hard-rejects** consumer IP ranges listed on Spamhaus's PBL, so mail to Outlook, Hotmail and Live never arrives at all - it is refused, not delayed. That is not something configuration can fix. You can try a self-service PBL removal at <https://check.spamhaus.org/>, but your ISP may simply re-list the range. The relay is the dependable answer.

selfmail already pins outbound to IPv4, because sending over IPv6 without a PTR record gets rejected outright by Gmail rather than merely filtered.

---

## Security notes

- **The web UI has no login.** Anyone who can reach the port can read your mail and send as you. Keep it on a trusted network, or put it behind a reverse proxy, tunnel or VPN that provides its own authentication. Do not expose it directly to the internet.
- The inbound webhook is authenticated by a shared secret in the URL path. In relay mode that URL is published in a public DNS TXT record, so **anyone who reads your zone can POST messages into your inbox.** They cannot send, relay or read anything — the worst case is junk in your Maildir. Restrict the endpoint to your relay's published source IPs if that matters to you.
- Postfix is configured to reject relaying for anyone outside `127.0.0.0/8`. Verify after install:
  ```bash
  printf 'EHLO t\r\nMAIL FROM:<a@b.c>\r\nRCPT TO:<x@gmail.com>\r\nQUIT\r\n' | nc YOUR_LAN_IP 25
  ```
  You want `Relay access denied`. If you see `250`, stop and fix it before going near the internet.
- No SASL/submission service is exposed by default, so there's no password endpoint on port 25 to brute-force.

---

## Troubleshooting

```bash
systemctl status selfmail postfix opendkim
journalctl -u selfmail -n 50
tail -f /var/log/mail.log          # /var/log/maillog on RHEL-family
```

**"Relay access denied" when sending, or Postfix seems up but nothing works** — another mail server is holding port 25, so Postfix never bound to it and *that* server is answering with its own policy. On Debian/Ubuntu this is silent, because `postfix.service` is only a wrapper and still reports `active`. Check what really happened:
```bash
sudo postfix status                  # the honest answer
sudo ss -lntp | grep :25             # who actually owns the port
journalctl -u postfix -n 30          # look for "Address already in use"
```
`run.sh` stops and disables the usual culprits (exim4, sendmail, opensmtpd, nullmailer) automatically.

**DNS checks look wrong just after adding records** — the checker queries 1.1.1.1/8.8.8.8/9.9.9.9 directly rather than the system resolver, precisely because a local stub caches NXDOMAIN for the zone's negative TTL and would keep reporting a record missing long after it exists. If a record still reads missing, compare the "Currently resolves to" line against the expected value.

**Mail sends but never arrives** — check the queue with `mailq`. A `status=sent` line in the log means the receiving server accepted it; where it filed it is a separate question.

**DKIM not signing** — `opendkim-testkey -d YOUR_DOMAIN -s YOUR_SELECTOR -vvv` should print `key OK`. "key not secure" just means no DNSSEC and is harmless. If Postfix can't reach the milter socket, confirm it is group-owned by `postfix`.

**Inbound webhook silent** — verify the public URL first:
```bash
curl https://YOUR-URL/inbound/YOUR-SECRET/ping     # expects {"ok":true,"ready":true}
```
The relay's MX and `forward-email=` TXT records must both be present on your mail domain; the **DNS** tab's Check button verifies them.
If that works but mail still doesn't arrive, the TXT record pointing the relay at your URL is wrong.

---

## License

MIT
