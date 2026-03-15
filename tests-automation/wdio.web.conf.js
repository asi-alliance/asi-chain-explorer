const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

exports.config = {
    user: process.env.LT_USER_NAME,
    key: process.env.LT_ACCESS_KEY,
    hostname: 'hub.lambdatest.com',
    port: 443,
    path: '/wd/hub',
    protocol: 'https',

    specs: ['./TestSuites/**/*.test.js'],
    exclude: [],

    maxInstances: 1,

    // Filter with TEST_PLATFORM=mac|win and TEST_BROWSER=Chrome|Firefox|Safari|Edge
    capabilities: (() => {
        const all = [
            {
                browserName: 'Chrome',
                browserVersion: 'latest',
                'LT:Options': {
                    platformName: 'Windows 11',
                    build: 'ASI Explorer Full Browser Suite',
                    name: 'Chrome on Windows 11',
                    selenium_version: '4.21.0',
                    network: true,
                },
            },
            {
                browserName: 'Firefox',
                browserVersion: 'latest',
                'LT:Options': {
                    platformName: 'Windows 11',
                    build: 'ASI Explorer Full Browser Suite',
                    name: 'Firefox on Windows 11',
                    selenium_version: '4.21.0',
                    network: true,
                },
            },
            {
                browserName: 'MicrosoftEdge',
                browserVersion: 'latest',
                'LT:Options': {
                    platformName: 'Windows 11',
                    build: 'ASI Explorer Full Browser Suite',
                    name: 'Edge on Windows 11',
                    selenium_version: '4.21.0',
                    network: true,
                },
            },
            {
                browserName: 'Safari',
                browserVersion: 'latest',
                'LT:Options': {
                    platformName: 'macOS Sonoma',
                    build: 'ASI Explorer Full Browser Suite',
                    name: 'Safari on macOS',
                    selenium_version: '4.21.0',
                    network: true,
                },
            },
            {
                browserName: 'Chrome',
                browserVersion: 'latest',
                'LT:Options': {
                    platformName: 'macOS Sonoma',
                    build: 'ASI Explorer Full Browser Suite',
                    name: 'Chrome on macOS',
                    selenium_version: '4.21.0',
                    network: true,
                },
            },
            {
                browserName: 'Firefox',
                browserVersion: 'latest',
                'LT:Options': {
                    platformName: 'macOS Sonoma',
                    build: 'ASI Explorer Full Browser Suite',
                    name: 'Firefox on macOS',
                    selenium_version: '4.21.0',
                    network: true,
                },
            },
        ];

        const platform = (process.env.TEST_PLATFORM || '').toLowerCase();
        const browser = (process.env.TEST_BROWSER || '').toLowerCase();

        return all.filter(cap => {
            const p = cap['LT:Options'].platformName.toLowerCase();
            const b = cap.browserName.toLowerCase();
            if (platform === 'mac' && !p.includes('macos')) return false;
            if (platform === 'win' && !p.includes('windows')) return false;
            if (browser && b !== browser && cap['LT:Options'].name.toLowerCase().indexOf(browser) === -1) return false;
            return true;
        });
    })(),

    logLevel: 'info',
    bail: 0,

    waitforTimeout: 10000,
    connectionRetryTimeout: 60000,
    connectionRetryCount: 3,

    services: ['lambdatest'],
    framework: 'mocha',
    reporters: ['spec'],

    mochaOpts: {
        ui: 'bdd',
        timeout: 120000,
    },

    // Basic Auth for DEV environment
    // Safari strips credentials from URLs, so we fall back to filling the auth form
    before: async function () {
        const authUser = process.env.BASIC_AUTH_USER;
        const authPass = process.env.BASIC_AUTH_PASS;
        const baseUrl = process.env.URL_TO_TEST || 'https://explorer.dev.asichain.io';

        if (authUser && authPass) {
            const urlObj = new URL(baseUrl);
            const authUrl = `${urlObj.protocol}//${authUser}:${authPass}@${urlObj.host}${urlObj.pathname}`;
            console.log(`Authenticating with Basic Auth for DEV environment: ${urlObj.host}`);
            await browser.url(authUrl);
            await browser.pause(3000);

            // Fallback: if browser shows an auth form (Safari strips URL credentials)
            try {
                const passwordInput = await $('input[type="password"]');
                if (await passwordInput.isExisting()) {
                    console.log('Auth form detected — filling credentials via form');
                    const usernameInput = await $('input[type="text"], input[name="username"], input[name="user"]');
                    await usernameInput.setValue(authUser);
                    await passwordInput.setValue(authPass);
                    const submitBtn = await $('button[type="submit"], input[type="submit"]');
                    await submitBtn.click();
                    await browser.pause(3000);
                }
            } catch (e) {
                // No auth form — URL credentials worked
            }
        }
    },

    beforeSuite: async function (suite) {
        try {
            await browser.executeScript(`lambda-name=${suite.title}`, []);
            console.log(`LambdaTest session name set to: "${suite.title}"`);
        } catch (err) {
            console.error('Failed to set LambdaTest session name:', err.message);
        }
    },

    afterTest: async function (test, context, { error }) {
        try {
            const status = error ? 'failed' : 'passed';
            const testName = `${test.parent} - ${test.title}`;
            await browser.executeScript(`lambda-name=${testName}`, []);
            await browser.executeScript(`lambda-status=${status}`, []);

            console.log(`Sent LambdaTest name: "${testName}" and status: ${status}`);
        } catch (err) {
            console.error('LambdaTest update failed:', err.message);
        }

        await browser.pause(1000);
    },
};
