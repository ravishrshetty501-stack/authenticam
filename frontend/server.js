// Custom HTTPS dev server using mkcert trusted certificates
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = true;
const hostname = '0.0.0.0';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const certDir = __dirname;
const keyFile = path.join(certDir, '172.20.199.120+2-key.pem');
const certFile = path.join(certDir, '172.20.199.120+2.pem');

const httpsOptions = {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile),
};

app.prepare().then(() => {
    createServer(httpsOptions, async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error:', err);
            res.statusCode = 500;
            res.end('Internal server error');
        }
    }).listen(port, hostname, (err) => {
        if (err) throw err;
        console.log(`✅ AuthentiCam running on https://172.20.199.120:${port}`);
        console.log(`   Local: https://localhost:${port}`);
    });
});
