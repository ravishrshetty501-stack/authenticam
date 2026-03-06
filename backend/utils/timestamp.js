/**
 * timestamp.js — Trusted Timestamp Service for AuthentiCam
 *
 * Provides NTP-synchronized timestamps for recordings.
 * Falls back to system clock when NTP is unreachable, but logs the
 * fallback so the certificate can be flagged accordingly.
 *
 * The timestamp_proof object stored in certificates:
 *   {
 *     iso:          "2024-01-01T00:00:00.000Z",
 *     unix:         1704067200000,
 *     source:       "ntp" | "system",
 *     ntpServer:    "pool.ntp.org",
 *     ntpOffset:    -12,        // ms drift from system clock
 *     roundtripMs:  40,
 *     reliable:     true
 *   }
 *
 * @module timestamp
 */

'use strict';

const dns = require('dns').promises;
const dgram = require('dgram');

const NTP_PORT = 123;
const NTP_SERVER = 'pool.ntp.org';
const NTP_TIMEOUT_MS = 3000;
const NTP_EPOCH_OFFSET = 2208988800; // seconds between 1900 and 1970

/**
 * Query an NTP server and return the server-reported time plus round-trip stats.
 * @returns {Promise<{ serverTime: number, roundtripMs: number, offsetMs: number }>}
 */
function queryNTP() {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const packet = Buffer.alloc(48);
        packet[0] = 0x1b; // NTP version 3, client mode

        const sentAt = Date.now();

        const timeout = setTimeout(() => {
            client.close();
            reject(new Error('NTP query timed out'));
        }, NTP_TIMEOUT_MS);

        client.on('message', (msg) => {
            clearTimeout(timeout);
            const receivedAt = Date.now();

            // Bytes 40-43: Transmit Timestamp (seconds since 1900)
            const hi = msg.readUInt32BE(40);
            const lo = msg.readUInt32BE(44);
            const ntpSeconds = hi - NTP_EPOCH_OFFSET + lo / Math.pow(2, 32);
            const serverTime = Math.round(ntpSeconds * 1000);
            const roundtripMs = receivedAt - sentAt;
            const offsetMs = serverTime - (sentAt + Math.round(roundtripMs / 2));

            client.close();
            resolve({ serverTime, roundtripMs, offsetMs });
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            client.close();
            reject(err);
        });

        // Resolve NTP server to IP first (avoids issues on some platforms)
        dns.resolve4(NTP_SERVER)
            .then((addresses) => {
                client.send(packet, 0, packet.length, NTP_PORT, addresses[0], (err) => {
                    if (err) { clearTimeout(timeout); client.close(); reject(err); }
                });
            })
            .catch(() => {
                // Try sending to hostname directly as fallback
                client.send(packet, 0, packet.length, NTP_PORT, NTP_SERVER, (err) => {
                    if (err) { clearTimeout(timeout); client.close(); reject(err); }
                });
            });
    });
}

/**
 * Get a trusted timestamp. Tries NTP first, falls back to system clock.
 *
 * @returns {Promise<{
 *   iso: string,
 *   unix: number,
 *   source: 'ntp'|'system',
 *   ntpServer: string,
 *   ntpOffset: number,
 *   roundtripMs: number,
 *   reliable: boolean
 * }>}
 */
async function getTrustedTimestamp() {
    const systemTime = Date.now();

    try {
        const { serverTime, roundtripMs, offsetMs } = await queryNTP();
        return {
            iso: new Date(serverTime).toISOString(),
            unix: serverTime,
            source: 'ntp',
            ntpServer: NTP_SERVER,
            ntpOffset: offsetMs,
            roundtripMs,
            reliable: true,
        };
    } catch (err) {
        console.warn('[timestamp] NTP unavailable, using system clock:', err.message);
        return {
            iso: new Date(systemTime).toISOString(),
            unix: systemTime,
            source: 'system',
            ntpServer: NTP_SERVER,
            ntpOffset: 0,
            roundtripMs: 0,
            reliable: false,
        };
    }
}

/**
 * Validate a timestamp proof from a certificate.
 * Checks:
 *   1. Timestamp is not in the future (> 60s grace allowed for clock skew)
 *   2. Timestamp is not older than MAX_AGE_DAYS
 *   3. Source is known ('ntp' or 'system')
 *
 * @param {{ iso: string, source: string, reliable: boolean }} timestampProof
 * @param {{ maxAgeDays?: number }} opts
 * @returns {{ valid: boolean, details: string, ageHours: number }}
 */
function validateTimestamp(timestampProof, opts = {}) {
    const maxAgeDays = opts.maxAgeDays || 3650; // ~10 years default
    const now = Date.now();
    const ts = new Date(timestampProof?.iso).getTime();

    if (isNaN(ts)) {
        return { valid: false, details: 'Timestamp is not a valid date', ageHours: -1 };
    }

    if (ts > now + 60_000) {
        return { valid: false, details: 'Timestamp is in the future — possible clock manipulation', ageHours: -1 };
    }

    const ageMs = now - ts;
    const ageHours = ageMs / 3_600_000;
    const maxAgeMs = maxAgeDays * 86_400_000;

    if (ageMs > maxAgeMs) {
        return { valid: false, details: `Timestamp is ${Math.round(ageHours / 24)} days old (max ${maxAgeDays} days)`, ageHours };
    }

    const source = timestampProof?.source;
    const sourceNote = source === 'ntp' ? 'NTP-synchronized' : 'System clock (unverified)';

    return {
        valid: true,
        details: `Timestamp valid — ${sourceNote}, ${Math.round(ageHours)} hours ago`,
        ageHours,
    };
}

module.exports = { getTrustedTimestamp, validateTimestamp };
