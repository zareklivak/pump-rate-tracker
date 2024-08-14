const fs = require('fs').promises;
const axios = require('axios');

const HELIUS_API_KEY = '9a0a2acf-471e-4fc0-9ebd-0624001668c1'; // Replace with your actual Helius API key
const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const mintAddressesFile = 'mint_addresses.json';
const holderDataFile = 'holder_data.json';

async function getTokenHolders(mint) {
    let page = 1;
    let allOwners = new Set();

    while (true) {
        try {
            const response = await axios.post(url, {
                jsonrpc: "2.0",
                method: "getTokenAccounts",
                id: "helius-test",
                params: {
                    page: page,
                    limit: 1000,
                    displayOptions: {},
                    mint: mint,
                },
            });

            const data = response.data;
            if (!data.result || data.result.token_accounts.length === 0) {
                break;
            }

            data.result.token_accounts.forEach((account) => allOwners.add(account.owner));
            page++;
        } catch (error) {
            console.error(`Error fetching token holders for mint ${mint}:`, error.message);
            break;
        }
    }

    return allOwners.size;
}

async function updateHolderData() {
    try {
        const mintAddresses = JSON.parse(await fs.readFile(mintAddressesFile, 'utf8'));
        let holderData = {};

        try {
            holderData = JSON.parse(await fs.readFile(holderDataFile, 'utf8'));
        } catch (error) {
            // File doesn't exist or is empty, which is fine
        }

        const currentTime = Date.now();
        let updatedCount = 0;

        for (const mint of mintAddresses) {
            const holders = await getTokenHolders(mint);

            // Check if this mint is already being tracked
            if (!holderData[mint]) {
                // If not tracked yet, start tracking with the current time
                holderData[mint] = [{ timestamp: currentTime, holders: holders }];
            } else {
                // Calculate the time difference since first tracking
                const firstSeen = holderData[mint][0].timestamp;
                const timeElapsed = (currentTime - firstSeen) / 1000; // in seconds

                if (timeElapsed > 60 && holders < 10) {
                    console.log(`Stopped tracking ${mint} as it did not reach 10 holders in 1 minute.`);
                    continue; // Skip updating this mint further
                }

                // If still within the minute or has reached 10 holders, continue tracking
                holderData[mint].push({ timestamp: currentTime, holders: holders });
                updatedCount++;
            }
        }

        await fs.writeFile(holderDataFile, JSON.stringify(holderData, null, 2));
        console.log(`Updated holder data at ${new Date().toISOString()}. Mints updated: ${updatedCount}`);
    } catch (error) {
        console.error('Error updating holder data:', error);
    }
}


// Run the update every 10 secs
setInterval(updateHolderData, 10000);

// Initial run
updateHolderData();