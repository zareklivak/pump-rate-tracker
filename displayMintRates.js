const fs = require('fs').promises;
const express = require('express');
const app = express();
const port = 3000;

const holderDataFile = 'holder_data.json';

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Use HSL color space for better distribution of colors
    const hue = hash % 360; // Range: 0-360
    const saturation = 60 + (hash % 20); // Range: 60-80 to keep colors more pastel
    const lightness = 70 + (hash % 10); // Range: 70-80 to keep colors light

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


function calculateBuyRate(snapshots, timeWindow) {
    const now = new Date();
    const windowStart = new Date(now - timeWindow);
    const recentSnapshots = snapshots.filter(s => new Date(s.timestamp) >= windowStart);

    if (recentSnapshots.length < 2) return 0;

    const oldest = recentSnapshots[0];
    const newest = recentSnapshots[recentSnapshots.length - 1];
    const holderDiff = newest.holders - oldest.holders;

    return Math.max(0, holderDiff);
}

async function getHolderRates() {
    try {
        const holderData = JSON.parse(await fs.readFile(holderDataFile, 'utf8'));
        const rates = {
            '1min': [],
            '3min': [],
            '5min': []
        };

        for (const [mint, snapshots] of Object.entries(holderData)) {
            const rate1min = calculateBuyRate(snapshots, 60 * 1000);
            const rate3min = calculateBuyRate(snapshots, 3 * 60 * 1000);
            const rate5min = calculateBuyRate(snapshots, 5 * 60 * 1000);

            if (rate1min > 0) rates['1min'].push({ mint, rate: rate1min });
            if (rate3min > 0) rates['3min'].push({ mint, rate: rate3min });
            if (rate5min > 0) rates['5min'].push({ mint, rate: rate5min });
        }

        for (const window in rates) {
            rates[window].sort((a, b) => b.rate - a.rate);
        }

        return rates;
    } catch (error) {
        console.error('Error calculating holder rates:', error);
        return null;
    }
}

function generateTable(windowRates) {
    let html = `
    <table>
        <tr><th class="mint-address">Mint</th><th class="rate-value">New Holders</th></tr>
    `;
    windowRates.forEach(({ mint, rate }) => {
        const color = stringToColor(mint);
        html += `<tr style="background-color: ${color};"><td class="mint-address">${mint}</td><td class="rate-value">${rate}</td></tr>`;
    });
    html += `
    </table>
    `;
    return html;
}

app.get('/', async (req, res) => {
    const rates = await getHolderRates();
    if (!rates) {
        res.status(500).send('Error calculating rates');
        return;
    }

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mint Holder Rates</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f0f0f0;
            }
            h1 {
                text-align: center;
                color: #333;
            }
            .container {
                display: flex;
                justify-content: space-between;
                flex-wrap: wrap;
            }
            .rate-list {
                width: 32%;
                margin-bottom: 20px;
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            @media (max-width: 1200px) {
                .rate-list {
                    width: 100%;
                }
            }
            .rate-list h2 {
                background-color: #4CAF50;
                color: white;
                margin: 0;
                padding: 10px;
                text-align: center;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #f2f2f2;
                font-weight: bold;
            }
            tr:nth-child(even) {
                background-color: #f9f9f9;
            }
            .mint-address {
                width: 75%;
                word-break: break-all;
            }
            .rate-value {
                width: 25%;
                text-align: right;
            }
        </style>
        <script>
            function refreshRates() {
                fetch(window.location.href)
                    .then(response => response.text())
                    .then(html => {
                        document.body.innerHTML = html;
                    });
            }
            setInterval(refreshRates, 10000);
        </script>
    </head>
    <body>
        <h1>Mint Holder Rates</h1>
        <div class="container">
    `;

    for (const [window, windowRates] of Object.entries(rates)) {
        html += `
        <div class="rate-list">
            <h2>${window} Rate</h2>
            ${generateTable(windowRates)}
        </div>
        `;
    }

    html += `
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(port, () => {
    console.log(`Mint rate display server running at http://localhost:${port}`);
});

// Update rates every 10 seconds
setInterval(async () => {
    await getHolderRates();
    console.log('Updated rates');
}, 10000);

// Initial run
getHolderRates();
