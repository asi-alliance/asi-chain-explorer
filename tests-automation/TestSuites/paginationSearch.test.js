// Blocks pagination: controls, page navigation, direct page input, old block search.
const BlocksPage = require('../pages/BlocksPage');

const BASE_URL = process.env.URL_TO_TEST || 'https://explorer.dev.asichain.io';

const MANUAL_OLD_BLOCK = process.env.TEST_OLD_BLOCK_NUMBER ? parseInt(process.env.TEST_OLD_BLOCK_NUMBER, 10) : null;

describe('Search Old Transaction with Pagination', () => {
    describe('Blocks page pagination', () => {
        before(async () => {
            await browser.url(BASE_URL);
            await browser.pause(3000);
        });

        it('should display blocks list on home page', async () => {
            const isDisplayed = await BlocksPage.isBlocksListDisplayed();
            expect(isDisplayed).toBe(true);
        });

        it('should show pagination controls', async () => {
            const hasPagination = await BlocksPage.isPaginationDisplayed();
            expect(hasPagination).toBe(true);
        });

        it('should show pagination info with total blocks count', async () => {
            const info = await BlocksPage.paginationInfo;
            await info.waitForDisplayed();
            const text = await info.getText();
            expect(text).toMatch(/Showing \d+-\d+ of \d+ blocks/);
        });

        it('should start on page 1', async () => {
            const currentPage = await BlocksPage.getCurrentPage();
            expect(currentPage).toBe(1);
        });

        it('should have Previous button disabled on first page', async () => {
            const prevBtn = await BlocksPage.prevButton;
            const isDisabled = await prevBtn.getAttribute('disabled');
            expect(isDisabled).not.toBeNull();
        });

        it('should have Next button enabled on first page', async () => {
            const nextBtn = await BlocksPage.nextButton;
            const isDisabled = await nextBtn.getAttribute('disabled');
            expect(isDisabled).toBeNull();
        });
    });

    describe('Navigate to next page', () => {
        let firstPageBlocks;

        before(async () => {
            await browser.url(BASE_URL);
            await browser.pause(3000);
        });

        it('should record blocks on first page', async () => {
            firstPageBlocks = await BlocksPage.getBlockNumbers();
            expect(firstPageBlocks.length).toBeGreaterThan(0);
            console.log(`First page blocks: ${firstPageBlocks.slice(0, 5).join(', ')}...`);
        });

        it('should navigate to page 2 and show different blocks', async () => {
            await BlocksPage.goToNextPage();

            const currentPage = await BlocksPage.getCurrentPage();
            expect(currentPage).toBe(2);

            const secondPageBlocks = await BlocksPage.getBlockNumbers();
            expect(secondPageBlocks.length).toBeGreaterThan(0);

            // allow equality — live updates can shift blocks between pages
            const maxPage2 = Math.max(...secondPageBlocks);
            const minPage1 = Math.min(...firstPageBlocks);
            expect(maxPage2).toBeLessThanOrEqual(minPage1);

            console.log(`Second page blocks: ${secondPageBlocks.slice(0, 5).join(', ')}...`);
        });

        it('should navigate back to page 1', async () => {
            await BlocksPage.goToPreviousPage();

            const currentPage = await BlocksPage.getCurrentPage();
            expect(currentPage).toBe(1);
        });
    });

    describe('Navigate to specific page using page input', () => {
        before(async () => {
            await browser.url(BASE_URL);
            await browser.pause(3000);
        });

        it('should jump to page 3 via direct input', async () => {
            await BlocksPage.goToPage(3);

            const currentPage = await BlocksPage.getCurrentPage();
            expect(currentPage).toBe(3);

            const blocks = await BlocksPage.getBlockNumbers();
            expect(blocks.length).toBeGreaterThan(0);
            console.log(`Page 3 blocks: ${blocks.slice(0, 5).join(', ')}...`);
        });
    });

    describe('Find old block not on first page', () => {
        let oldBlockNumber;

        before(async () => {
            await browser.url(BASE_URL);
            await browser.pause(3000);
        });

        it('should use manual block number from .env or scrape from a later page', async () => {
            if (MANUAL_OLD_BLOCK) {
                oldBlockNumber = MANUAL_OLD_BLOCK;
                console.log(`Using manual old block number from .env: ${oldBlockNumber}`);
            } else {
                await BlocksPage.goToPage(3);
                await browser.pause(2000);

                const blocks = await BlocksPage.getBlockNumbers();
                expect(blocks.length).toBeGreaterThan(0);

                oldBlockNumber = blocks[Math.floor(blocks.length / 2)];
                expect(oldBlockNumber).toBeGreaterThan(0);
                console.log(`Scraped old block number from page 3: ${oldBlockNumber}`);

                await BlocksPage.goToPage(1);
                await browser.pause(2000);
            }
        });

        it('should search for the old block using blocks page search', async () => {
            await BlocksPage.searchByBlockNumber(oldBlockNumber);
            await browser.pause(2000);

            const blocks = await BlocksPage.getBlockNumbers();
            const found = blocks.includes(oldBlockNumber);
            expect(found).toBe(true);
            console.log(`Found old block #${oldBlockNumber} via search`);
        });

        it('should search for the old block using global search', async () => {
            await browser.url(BASE_URL);
            await browser.pause(3000);

            await BlocksPage.globalSearch(String(oldBlockNumber));
            await browser.pause(2000);

            const input = await $('input[placeholder="Search blocks, transfers, addresses..."]');
            const value = await input.getValue();
            expect(value).toContain(String(oldBlockNumber));

            await BlocksPage.clearGlobalSearch();
        });
    });

    describe('Search on blocks page by block number', () => {
        before(async () => {
            await browser.url(BASE_URL);
            await browser.pause(3000);
        });

        it('should filter blocks when searching by block number', async () => {
            const firstBlockNumber = await BlocksPage.getFirstBlockNumber();
            expect(firstBlockNumber).not.toBeNull();

            await BlocksPage.searchByBlockNumber(firstBlockNumber);
            await browser.pause(2000);

            const blocks = await BlocksPage.getBlockNumbers();
            expect(blocks.length).toBeGreaterThan(0);
            expect(blocks).toContain(firstBlockNumber);
        });
    });
});
