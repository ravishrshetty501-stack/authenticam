/**
 * audit.js — Chain-of-Custody & Blockchain Audit REST API
 *
 * Endpoints:
 *   GET  /api/audit/chain              — Full local blockchain log
 *   GET  /api/audit/chain/verify       — Verify chain integrity
 *   GET  /api/audit/certificate/:certId — Blocks + chain-of-custody for one cert
 *
 * @module routes/audit
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getFullChain, verifyChain, getBlockByCertId } = require('../utils/blockchain');

// GET /api/audit/chain — full blockchain ledger
router.get('/chain', (req, res) => {
    try {
        const chain = getFullChain();
        const integrity = verifyChain();
        res.json({
            chainHead: chain.chainHead,
            blockCount: chain.blocks.length,
            integrity,
            blocks: chain.blocks,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load blockchain', details: err.message });
    }
});

// GET /api/audit/chain/verify — integrity check only
router.get('/chain/verify', (req, res) => {
    try {
        const result = verifyChain();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Chain verification failed', details: err.message });
    }
});

// GET /api/audit/certificate/:certId — blocks and chain-of-custody for one certificate
router.get('/certificate/:certId', async (req, res) => {
    try {
        const { certId } = req.params;
        const blocks = getBlockByCertId(certId);

        // If MongoDB mode, also fetch chain-of-custody from DB
        let chainOfCustody = [];
        if (global.dbMode === 'mongodb') {
            try {
                const Certificate = require('../models/Certificate');
                const cert = await Certificate.findOne({ certificateId: certId })
                    .select('chainOfCustody certificateId fileHash issuedAt userId')
                    .populate('userId', 'username email');
                if (cert) {
                    chainOfCustody = cert.chainOfCustody || [];
                }
            } catch { /* ignore DB errors */ }
        }

        res.json({
            certId,
            blockchainEntries: blocks,
            anchored: blocks.length > 0,
            chainOfCustody,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch audit record', details: err.message });
    }
});

module.exports = router;
