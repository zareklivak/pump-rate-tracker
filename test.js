const axios = require('axios');
const fs = require('fs').promises;

const apiKey = 'cc5807a0-d4bf-41a7-94c3-1690283903d5';
const tokenId = '2eecd1a9-1c23-4a55-823c-1453426eacdc';
const mintAddressesFile = 'mint_addresses.json';
const lastProcessedIdFile = 'last_processed_id.txt';

async function fetchAndProcessRequests() {
    try {
        let lastProcessedId = await getLastProcessedId();
        let page = 1;
        let hasNewRequests = false;

        while (true) {
            const response = await axios.get(`https://webhook.site/token/${tokenId}/requests`, {
                headers: {
                    'Api-Key': apiKey,
                    'Accept': 'application/json',
                },
                params: {
                    page: page,
                    limit: 100 // Adjust as needed
                }
            });

            const mintAddresses = new Set();
            let foundLastProcessed = false;

            for (const request of response.data.data) {
                if (request.uuid === lastProcessedId) {
                    foundLastProcessed = true;
                    break;
                }

                hasNewRequests = true;
                try {
                    const content = JSON.parse(request.content);
                    content[0].tokenTransfers.forEach(transfer => {
                        if (transfer.mint.toLowerCase().endsWith('pump')) {
                            mintAddresses.add(transfer.mint);
                        }
                    });
                } catch (error) {
                    console.error('Error parsing request content:', error);
                }
            }

            if (mintAddresses.size > 0) {
                await updateMintAddresses(Array.from(mintAddresses));
            }

            if (foundLastProcessed || response.data.data.length === 0) {
                break;
            }

            page++;
        }

        if (hasNewRequests && response.data.data.length > 0) {
            await setLastProcessedId(response.data.data[0].uuid);
        }
    } catch (error) {
        console.error('Error fetching or processing requests:', error);
    }
}

async function updateMintAddresses(newAddresses) {
    try {
        let existingAddresses = [];
        try {
            const data = await fs.readFile(mintAddressesFile, 'utf8');
            existingAddresses = JSON.parse(data);
        } catch (error) {
            // File doesn't exist or is empty, which is fine
        }

        // Filter out addresses that are already being tracked
        const filteredAddresses = newAddresses.filter(addr => !existingAddresses.includes(addr));
        const updatedAddresses = [...new Set([...existingAddresses, ...filteredAddresses])];

        await fs.writeFile(mintAddressesFile, JSON.stringify(updatedAddresses, null, 2));
        console.log(`Updated mint addresses. Total unique addresses: ${updatedAddresses.length}`);
    } catch (error) {
        console.error('Error updating mint addresses:', error);
    }
}


async function getLastProcessedId() {
    try {
        return await fs.readFile(lastProcessedIdFile, 'utf8');
    } catch (error) {
        return '';
    }
}

async function setLastProcessedId(id) {
    await fs.writeFile(lastProcessedIdFile, id);
}

// Run the script every 10 seconds
setInterval(fetchAndProcessRequests, 10000);

// Initial run
fetchAndProcessRequests();