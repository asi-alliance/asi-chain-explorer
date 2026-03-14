// Transaction detail page: Overview fields, Code/Transfers/BlockInfo tabs, transfer type.
const TransactionsPage = require('../pages/TransactionsPage');
const TransactionDetailPage = require('../pages/TransactionDetailPage');

const BASE_URL = process.env.URL_TO_TEST || 'https://explorer.dev.asichain.io';

describe('View Transaction Details', () => {
    describe('Open deploy transaction detail page from list', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickDeploymentsTab();
            await browser.pause(1500);
        });

        it('should have at least one deployment transaction', async () => {
            const count = await TransactionsPage.getTransactionCount();
            expect(count).toBeGreaterThan(0);
        });

        it('should navigate to transaction detail page when clicking a transaction', async () => {
            await TransactionsPage.clickTransaction(0);

            const isLoaded = await TransactionDetailPage.isDetailPageLoaded();
            expect(isLoaded).toBe(true);
        });

        it('should display transaction hash on detail page', async () => {
            const url = await browser.getUrl();
            expect(url).toContain('/transaction/');
        });
    });

    describe('Overview tab displays transaction information', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickDeploymentsTab();
            await browser.pause(1500);
            await TransactionsPage.clickTransaction(0);
            await browser.pause(2000);
        });

        it('should show Transaction Information section', async () => {
            const heading = await TransactionDetailPage.transactionInfoHeading;
            await heading.waitForDisplayed({ timeout: 10000 });
            const isDisplayed = await heading.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should display Transaction ID field', async () => {
            const label = await TransactionDetailPage.transactionIdLabel;
            const isDisplayed = await label.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should display Deployer field', async () => {
            const label = await TransactionDetailPage.deployerLabel;
            const isDisplayed = await label.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should display Type field with smart_contract for deploy', async () => {
            const type = await TransactionDetailPage.getTransactionType();
            expect(type).toContain('smart_contract');
        });

        it('should display Timestamp field', async () => {
            const label = await TransactionDetailPage.timestampLabel;
            const isDisplayed = await label.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should show Execution Details section', async () => {
            const heading = await TransactionDetailPage.executionDetailsHeading;
            await heading.waitForDisplayed({ timeout: 5000 });
            const isDisplayed = await heading.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should display Phlo Cost field', async () => {
            const cost = await TransactionDetailPage.getPhloCost();
            expect(cost).not.toBeNull();
            console.log(`Phlo Cost: ${cost}`);
        });

        it('should display Phlo Limit field', async () => {
            const label = await TransactionDetailPage.phloLimitLabel;
            const isDisplayed = await label.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should show Blockchain Information section', async () => {
            const heading = await TransactionDetailPage.blockchainInfoHeading;
            await heading.waitForDisplayed({ timeout: 5000 });
            const isDisplayed = await heading.isDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should display Block Number as a clickable link', async () => {
            const blockNum = await TransactionDetailPage.getBlockNumber();
            expect(blockNum).not.toBeNull();
            console.log(`Block Number: ${blockNum}`);
        });

        it('should display Signature field', async () => {
            const label = await TransactionDetailPage.signatureLabel;
            const isDisplayed = await label.isDisplayed();
            expect(isDisplayed).toBe(true);
        });
    });

    describe('Code tab displays contract code', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickDeploymentsTab();
            await browser.pause(1500);
            await TransactionsPage.clickTransaction(0);
            await browser.pause(2000);
        });

        it('should switch to Code tab', async () => {
            await TransactionDetailPage.clickCodeTab();
        });

        it('should display contract code or code section', async () => {
            const isDisplayed = await TransactionDetailPage.isCodeDisplayed();
            expect(isDisplayed).toBe(true);
        });
    });

    describe('Transfers tab displays transfer information', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickDeploymentsTab();
            await browser.pause(1500);
            await TransactionsPage.clickTransaction(0);
            await browser.pause(2000);
        });

        it('should show transfers count in tab label', async () => {
            const count = await TransactionDetailPage.getTransfersTabCount();
            expect(count).toBeGreaterThanOrEqual(0);
            console.log(`Transfers count: ${count}`);
        });

        it('should switch to Transfers tab', async () => {
            await TransactionDetailPage.clickTransfersTab();
            await browser.pause(1000);
        });
    });

    describe('Block Info tab displays block information', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickDeploymentsTab();
            await browser.pause(1500);
            await TransactionsPage.clickTransaction(0);
            await browser.pause(2000);
        });

        it('should switch to Block Info tab', async () => {
            await TransactionDetailPage.clickBlockInfoTab();
        });

        it('should display block information', async () => {
            const isDisplayed = await TransactionDetailPage.isBlockInfoDisplayed();
            expect(isDisplayed).toBe(true);
        });
    });

    describe('Transfer transaction details', () => {
        before(async () => {
            await browser.url(`${BASE_URL}/transactions`);
            await browser.pause(3000);
            await TransactionsPage.clickTransfersTab();
            await browser.pause(1500);
        });

        it('should have at least one transfer transaction', async () => {
            const count = await TransactionsPage.getTransactionCount();
            expect(count).toBeGreaterThan(0);
        });

        it('should display TRANSFER badge', async () => {
            const type = await TransactionsPage.getTransactionTypeAt(0);
            expect(type).toBe('TRANSFER');
        });

        it('should navigate to transfer transaction detail page', async () => {
            await TransactionsPage.clickTransaction(0);
            await browser.pause(2000);

            const isLoaded = await TransactionDetailPage.isDetailPageLoaded();
            expect(isLoaded).toBe(true);
        });

        it('should display transaction type for transfer transaction', async () => {
            const type = await TransactionDetailPage.getTransactionType();
            expect(type).not.toBeNull();
            console.log(`Transfer transaction type: ${type}`);
        });

        it('should display Deployer address for transfer', async () => {
            const deployer = await TransactionDetailPage.getDeployerAddress();
            expect(deployer).not.toBeNull();
            expect(deployer.length).toBeGreaterThan(10);
            console.log(`Transfer deployer: ${deployer.substring(0, 20)}...`);
        });

        it('should navigate back to transactions list', async () => {
            await TransactionDetailPage.goBack();

            const url = await browser.getUrl();
            expect(url).toContain('/transactions');
        });
    });
});
