const BasePage = require('./BasePage');

// Page object for /transactions (Deployments + Transfers tabs).
class TransactionsPage extends BasePage {
    // --- Selectors ---

    get pageHeading() {
        return $('main h1');
    }

    get searchInput() {
        return $('input[placeholder="Search by ID, address, or block hash..."]');
    }

    get deploymentsTab() {
        return $('//button[contains(., "Deployments")]');
    }

    get transfersTab() {
        return $('//button[contains(., "Transfers")]');
    }

    get transactionCards() {
        return $$('.asi-card.glass');
    }

    get globalSearchInput() {
        return $('input[placeholder="Search blocks, transfers, addresses..."]');
    }

    get paginationControls() {
        return $('.pagination-controls');
    }

    get prevPageBtn() {
        return $('//button[contains(., "Previous") or contains(., "Prev")]');
    }

    get nextPageBtn() {
        return $('//button[contains(., "Next")]');
    }

    // --- Data extraction (via browser.execute to handle live DOM updates) ---

    async getTransactionCount() {
        const cards = await this.transactionCards;
        return cards.length;
    }

    async getFirstTransactionTitle() {
        return browser.execute(() => {
            const cards = document.querySelectorAll('.asi-card.glass');
            if (cards.length === 0) return null;
            const headings = cards[0].querySelectorAll('h5');
            for (const h of headings) {
                const text = h.textContent.trim();
                if (text.includes('Deploy by') || text.includes('Transfer')) {
                    return text;
                }
            }
            return null;
        });
    }

    // Parses deployer hex from "Deploy by 04e4d995..." (handles both "..." and unicode "…")
    async getFirstTransactionDeployer() {
        const title = await this.getFirstTransactionTitle();
        if (!title) return null;

        const match = title.match(/Deploy by ([0-9a-f]+\.{3})/);
        if (match) return match[1];

        const match2 = title.match(/Deploy by ([0-9a-f]+\u2026)/);
        return match2 ? match2[1] : null;
    }

    async getTransactionTypeAt(index) {
        return browser.execute((idx) => {
            const cards = document.querySelectorAll('.asi-card.glass');
            if (idx >= cards.length) return null;
            const headings = cards[idx].querySelectorAll('h5');
            for (const h of headings) {
                const text = h.textContent.trim();
                if (text === 'DEPLOY' || text === 'TRANSFER') {
                    return text;
                }
            }
            return null;
        }, index);
    }

    // --- Actions ---

    async clickTransaction(index) {
        const cards = await this.transactionCards;
        if (index >= cards.length) {
            throw new Error(`Transaction at index ${index} not found. Only ${cards.length} transactions available.`);
        }
        await this.click(cards[index]);
        await browser.pause(2000);
    }

    async searchByQuery(query) {
        const input = await this.searchInput;
        await input.waitForDisplayed();
        await input.setValue(query);
        await browser.pause(1500);
    }

    async clearSearch() {
        const input = await this.searchInput;
        await input.clearValue();
        await browser.pause(1000);
    }

    async clickDeploymentsTab() {
        const tab = await this.deploymentsTab;
        await tab.waitForDisplayed();
        await this.click(tab);
        await browser.pause(1500);
    }

    async clickTransfersTab() {
        const tab = await this.transfersTab;
        await tab.waitForDisplayed();
        await this.click(tab);
        await browser.pause(1500);
    }

    async globalSearch(query) {
        const input = await this.globalSearchInput;
        await input.waitForDisplayed();
        // setValue() corrupts hex strings on LambdaTest
        await browser.execute((q) => {
            const el = document.querySelector('input[placeholder="Search blocks, transfers, addresses..."]');
            if (el) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, q);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, query);
        await browser.pause(1500);
    }

    async clearGlobalSearch() {
        const input = await this.globalSearchInput;
        await input.clearValue();
        await browser.pause(500);
    }

    async isSearchResultDisplayed() {
        await browser.pause(1000);
        const cards = await this.transactionCards;
        return cards.length > 0;
    }

    async hasPagination() {
        try {
            const controls = await this.paginationControls;
            return await controls.isDisplayed();
        } catch {
            return false;
        }
    }

    async goToNextPage() {
        const btn = await this.nextPageBtn;
        await btn.waitForDisplayed();
        await this.click(btn);
        await browser.pause(2000);
    }

    async getPageHeadingText() {
        const heading = await this.pageHeading;
        await heading.waitForDisplayed();
        return await heading.getText();
    }
}

module.exports = new TransactionsPage();
