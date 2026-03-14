const BasePage = require('./BasePage');

// Page object for /transaction/:hash detail page.
class TransactionDetailPage extends BasePage {
    // --- Selectors ---

    get backButton() {
        return $('//button[contains(., "Back")]');
    }

    get pageTitle() {
        return $('//h1[contains(., "Transaction Details")]');
    }

    get overviewTab() {
        return $('//button[contains(., "Overview")]');
    }

    get codeTab() {
        return $('//button[contains(., "Code")]');
    }

    get transfersTab() {
        return $('//button[contains(., "Transfers")]');
    }

    get blockInfoTab() {
        return $('//button[contains(., "Block Info")]');
    }

    get transactionInfoHeading() {
        return $('//h3[contains(., "Transaction Information")]');
    }

    get executionDetailsHeading() {
        return $('//h3[contains(., "Execution Details")]');
    }

    get blockchainInfoHeading() {
        return $('//h3[contains(., "Blockchain Information")]');
    }

    get transactionIdLabel() {
        return $('//*[contains(text(), "Transaction ID")]');
    }

    get deployerLabel() {
        return $('//*[contains(text(), "Deployer")]');
    }

    get typeLabel() {
        return $('//*[contains(text(), "Type")]');
    }

    get timestampLabel() {
        return $('//*[contains(text(), "Timestamp")]');
    }

    get phloCostLabel() {
        return $('//*[contains(text(), "Phlo Cost")]');
    }

    get phloLimitLabel() {
        return $('//*[contains(text(), "Phlo Limit")]');
    }

    get signatureLabel() {
        return $('//*[contains(text(), "Signature")]');
    }

    get blockNumberLink() {
        return $('a[href^="/block/"]');
    }

    // --- Tab navigation ---

    async isDetailPageLoaded() {
        try {
            const title = await this.pageTitle;
            await title.waitForDisplayed({ timeout: 10000 });
            return true;
        } catch {
            return false;
        }
    }

    async clickOverviewTab() {
        const tab = await this.overviewTab;
        await tab.waitForDisplayed();
        await this.click(tab);
        await browser.pause(1000);
    }

    async clickCodeTab() {
        const tab = await this.codeTab;
        await tab.waitForDisplayed();
        await this.click(tab);
        await browser.pause(1000);
    }

    async clickTransfersTab() {
        const tab = await this.transfersTab;
        await tab.waitForDisplayed();
        await this.click(tab);
        await browser.pause(1000);
    }

    async clickBlockInfoTab() {
        const tab = await this.blockInfoTab;
        await tab.waitForDisplayed();
        await this.click(tab);
        await browser.pause(1000);
    }

    // --- Field extraction (via browser.execute — no CSS classes on field values) ---

    // Finds "Type" label, then reads the sibling value element
    async getTransactionType() {
        return browser.execute(() => {
            const typeLabel = Array.from(document.querySelectorAll('*')).find(
                el => el.childNodes.length === 1
                    && el.childNodes[0].nodeType === 3
                    && el.textContent.trim() === 'Type'
            );
            if (!typeLabel) return null;
            const parent = typeLabel.parentElement;
            if (!parent) return null;
            const badge = parent.querySelector('[class*="badge"], span, h5');
            if (badge && badge !== typeLabel) return badge.textContent.trim();
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(typeLabel);
            for (let i = idx + 1; i < siblings.length; i++) {
                const text = siblings[i].textContent.trim();
                if (text) return text;
            }
            return null;
        });
    }

    async getDeployerAddress() {
        return browser.execute(() => {
            const label = Array.from(document.querySelectorAll('*')).find(
                el => el.childNodes.length === 1
                    && el.childNodes[0].nodeType === 3
                    && el.textContent.trim() === 'Deployer'
            );
            if (!label) return null;
            const parent = label.parentElement;
            if (!parent) return null;
            const siblings = Array.from(parent.children);
            const labelIdx = siblings.indexOf(label);
            for (let i = labelIdx + 1; i < siblings.length; i++) {
                const text = siblings[i].textContent.trim();
                if (text.length > 10) return text;
            }
            return null;
        });
    }

    async getPhloCost() {
        return browser.execute(() => {
            const label = Array.from(document.querySelectorAll('*')).find(
                el => el.childNodes.length === 1
                    && el.childNodes[0].nodeType === 3
                    && el.textContent.trim() === 'Phlo Cost'
            );
            if (!label) return null;
            const parent = label.parentElement;
            if (!parent) return null;
            const siblings = Array.from(parent.children);
            const labelIdx = siblings.indexOf(label);
            for (let i = labelIdx + 1; i < siblings.length; i++) {
                const text = siblings[i].textContent.trim();
                if (/^\d+$/.test(text)) return text;
            }
            return null;
        });
    }

    async getBlockNumber() {
        try {
            const link = await this.blockNumberLink;
            await link.waitForDisplayed({ timeout: 5000 });
            return await link.getText();
        } catch {
            return null;
        }
    }

    async isCodeDisplayed() {
        try {
            const codeBlock = await $('pre, code, .syntax-highlighter, [class*="highlight"], [class*="code"]');
            await codeBlock.waitForDisplayed({ timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async isBlockInfoDisplayed() {
        try {
            const heading = await $('//*[contains(text(), "Block Number")] | //*[contains(text(), "Block Hash")]');
            await heading.waitForDisplayed({ timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async getTransfersTabCount() {
        const tab = await this.transfersTab;
        const text = await tab.getText();
        const match = text.match(/Transfers\s*\((\d+)\)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    async goBack() {
        const btn = await this.backButton;
        await btn.waitForDisplayed();
        await this.click(btn);
        await browser.pause(2000);
    }
}

module.exports = new TransactionDetailPage();
