// Transaction search: hash, deployer, global search, invalid input, tab switching.
// Test data from .env or scraped from the page if not specified.
const TransactionsPage = require('../pages/TransactionsPage');

const BASE_URL = process.env.URL_TO_TEST || 'https://explorer.dev.asichain.io';

const MANUAL_TX_HASH = process.env.TEST_TRANSACTION_HASH || '';
const MANUAL_DEPLOYER = process.env.TEST_DEPLOYER_ADDRESS || '';

describe('Transaction Search by Hash and Other Parameters', () => {
    before(async () => {
        await browser.url(`${BASE_URL}/transactions`);
        await browser.pause(3000);
    });

    describe('Search by transaction hash', () => {
        let searchHash;

        it('should display deployments list on transactions page', async () => {
            await TransactionsPage.clickDeploymentsTab();

            const count = await TransactionsPage.getTransactionCount();
            expect(count).toBeGreaterThan(0);
        });

        it('should use manual hash from .env or scrape from page', async () => {
            if (MANUAL_TX_HASH) {
                searchHash = MANUAL_TX_HASH;
                console.log(`Using manual transaction hash from .env: ${searchHash}`);
            } else {
                await TransactionsPage.clickTransaction(0);
                const url = await browser.getUrl();
                searchHash = url.split('/transaction/')[1];
                expect(searchHash).toBeTruthy();
                console.log(`Scraped transaction hash from Explorer: ${searchHash.substring(0, 30)}...`);

                await browser.url(`${BASE_URL}/transactions`);
                await browser.pause(3000);
                await TransactionsPage.clickDeploymentsTab();
            }
        });

        it('should find transaction by hash in page search', async () => {
            const query = searchHash.substring(0, 20);
            await TransactionsPage.searchByQuery(query);
            const hasResults = await TransactionsPage.isSearchResultDisplayed();
            expect(hasResults).toBe(true);

            await TransactionsPage.clearSearch();
        });
    });

    describe('Search by deployer address', () => {
        let searchDeployer;

        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickDeploymentsTab();
        });

        it('should use manual deployer from .env or scrape from page', async () => {
            if (MANUAL_DEPLOYER) {
                searchDeployer = MANUAL_DEPLOYER;
                console.log(`Using manual deployer address from .env: ${searchDeployer}`);
            } else {
                searchDeployer = await TransactionsPage.getFirstTransactionDeployer();
                expect(searchDeployer).not.toBeNull();
                console.log(`Scraped deployer address from Explorer: ${searchDeployer}`);
            }
        });

        it('should find transaction by deployer address in page search', async () => {
            await TransactionsPage.searchByQuery(searchDeployer);
            const hasResults = await TransactionsPage.isSearchResultDisplayed();
            expect(hasResults).toBe(true);

            await TransactionsPage.clearSearch();
        });
    });

    describe('Search using global search', () => {
        it('should search via global search bar using hash or deployer', async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);

            let searchQuery;
            if (MANUAL_TX_HASH) {
                searchQuery = MANUAL_TX_HASH.substring(0, 20);
                console.log(`Using manual hash for global search: ${searchQuery}`);
            } else {
                await TransactionsPage.clickDeploymentsTab();
                const title = await TransactionsPage.getFirstTransactionTitle();
                expect(title).not.toBeNull();

                const match = title.match(/Deploy by ([0-9a-f]+)/);
                expect(match).not.toBeNull();
                searchQuery = match[1];
                console.log(`Scraped deployer for global search: ${searchQuery}`);
            }

            await TransactionsPage.globalSearch(searchQuery);
            await browser.pause(2000);

            // getValue() coerces hex strings to Number on LambdaTest
            const value = await browser.execute(() => {
                const input = document.querySelector('input[placeholder="Search blocks, transfers, addresses..."]');
                return input ? input.value : '';
            });
            expect(String(value)).toContain(searchQuery);

            await TransactionsPage.clearGlobalSearch();
        });
    });

    describe('Search with invalid hash', () => {
        it('should show no results for a non-existent hash', async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);

            const invalidHash = 'zzzz_nonexistent_hash_0000000000000000';
            await TransactionsPage.searchByQuery(invalidHash);
            await browser.pause(2000);

            const count = await TransactionsPage.getTransactionCount();
            expect(count).toBe(0);

            await TransactionsPage.clearSearch();
        });
    });

    describe('Switch between Deployments and Transfers tabs', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
        });

        it('should display Deployments tab with DEPLOY items', async () => {
            await TransactionsPage.clickDeploymentsTab();

            const heading = await TransactionsPage.getPageHeadingText();
            expect(heading).toContain('Smart Contract Deployments');

            const count = await TransactionsPage.getTransactionCount();
            expect(count).toBeGreaterThan(0);

            const type = await TransactionsPage.getTransactionTypeAt(0);
            expect(type).toBe('DEPLOY');
        });

        it('should switch to Transfers tab and display TRANSFER items', async () => {
            await TransactionsPage.clickTransfersTab();

            const heading = await TransactionsPage.getPageHeadingText();
            expect(heading).toContain('Token Transfers');

            const count = await TransactionsPage.getTransactionCount();
            expect(count).toBeGreaterThan(0);

            const type = await TransactionsPage.getTransactionTypeAt(0);
            expect(type).toBe('TRANSFER');
        });

        it('should switch back to Deployments tab', async () => {
            await TransactionsPage.clickDeploymentsTab();

            const heading = await TransactionsPage.getPageHeadingText();
            expect(heading).toContain('Smart Contract Deployments');
        });
    });
});
