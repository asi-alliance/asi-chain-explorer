const BasePage = require('./BasePage');

// Page object for the home page (blocks list + pagination).
class BlocksPage extends BasePage {
    // --- Selectors ---

    get pageHeading() {
        return $('//h1[contains(., "Recent Blocks")]');
    }

    get searchInput() {
        return $('input[placeholder="Search by block number or hash..."]');
    }

    get prevButton() {
        return $('//button[contains(., "Previous")]');
    }

    get nextButton() {
        return $('//button[contains(., "Next")]');
    }

    get pageInput() {
        return $('input[type="number"]');
    }

    get paginationInfo() {
        return $('//*[contains(text(), "Showing")]');
    }

    get globalSearchInput() {
        return $('input[placeholder="Search blocks, transfers, addresses..."]');
    }

    // --- Data extraction ---

    // Reads all block numbers in one browser.execute to avoid stale refs on live pages
    async getBlockNumbers() {
        return browser.execute(() => {
            const links = document.querySelectorAll('a.block-number[href^="/block/"]');
            return Array.from(links)
                .map(a => a.textContent.trim())
                .filter(t => /^\d+$/.test(t))
                .map(Number);
        });
    }

    async getFirstBlockNumber() {
        const numbers = await this.getBlockNumbers();
        return numbers.length > 0 ? numbers[0] : null;
    }

    async getFirstBlockHash() {
        return browser.execute(() => {
            const links = document.querySelectorAll('a.text-3[href^="/block/"]');
            for (const link of links) {
                const text = link.textContent.trim();
                if (/^[0-9a-f]/.test(text) && text.includes('...')) {
                    return text;
                }
            }
            return null;
        });
    }

    async getBlockCount() {
        const numbers = await this.getBlockNumbers();
        return numbers.length;
    }

    // --- Navigation ---

    async goToNextPage() {
        const nextBtn = await this.nextButton;
        await nextBtn.waitForDisplayed();
        await this.click(nextBtn);
        await browser.pause(2000);
    }

    async goToPreviousPage() {
        const prevBtn = await this.prevButton;
        await prevBtn.waitForDisplayed();
        await this.click(prevBtn);
        await browser.pause(2000);
    }

    // Sets page via native setter + events (Ctrl+A/Cmd+A unreliable cross-platform)
    async goToPage(pageNumber) {
        const input = await this.pageInput;
        await input.waitForDisplayed();
        await browser.execute((el, val) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeInputValueSetter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, input, String(pageNumber));
        await browser.pause(500);
        await input.click();
        await browser.keys('Enter');
        await browser.pause(2000);
    }

    async getCurrentPage() {
        const input = await this.pageInput;
        return parseInt(await input.getValue(), 10);
    }

    // --- Search ---

    async searchByBlockNumber(blockNumber) {
        const input = await this.searchInput;
        await input.waitForDisplayed();
        await input.setValue(String(blockNumber));
        await browser.pause(1500);
    }

    async clearSearch() {
        const input = await this.searchInput;
        await input.clearValue();
        await browser.pause(1000);
    }

    async globalSearch(query) {
        const input = await this.globalSearchInput;
        await input.waitForDisplayed();
        await input.setValue(query);
        await browser.pause(1500);
    }

    async clearGlobalSearch() {
        const input = await this.globalSearchInput;
        await input.clearValue();
        await browser.pause(500);
    }

    async isBlocksListDisplayed() {
        const numbers = await this.getBlockNumbers();
        return numbers.length > 0;
    }

    async isPaginationDisplayed() {
        const nextBtn = await this.nextButton;
        return await nextBtn.isDisplayed();
    }
}

module.exports = new BlocksPage();
