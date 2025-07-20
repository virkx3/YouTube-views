const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const net = require('net');
const { setTimeout } = require('timers/promises');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // Format: owner/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// Proxy sources
const PROXY_SOURCES = [
    'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc',
    'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http',
];

const USER_AGENT_SOURCES = [
    'https://raw.githubusercontent.com/tamimibrahim17/List-of-user-agents/master/Chrome.txt',
    'https://gist.githubusercontent.com/pzb/b4b6f57144aea7827ae4/raw/cf847b76a142955b1410c8bcef3aabe221a63db1/user-agents.txt'
];

class ProxyManager {
    // ... (keep existing ProxyManager implementation) ...
}

class UserAgentManager {
    // ... (keep existing UserAgentManager implementation) ...
}

class VideoManager {
    // ... (keep existing VideoManager implementation) ...
}

class GitHubUploader {
    constructor() {
        if (!GITHUB_TOKEN || !GITHUB_REPO) {
            console.warn('⚠️ GitHub credentials missing. Screenshots will be saved locally only.');
            this.enabled = false;
            return;
        }
        
        this.enabled = true;
        [this.repoOwner, this.repoName] = GITHUB_REPO.split('/');
    }

    async uploadScreenshot(filePath, sessionId) {
        if (!this.enabled) return null;
        
        try {
            const fileName = `screenshot-${sessionId}-${Date.now()}.png`;
            const fileContent = fs.readFileSync(filePath);
            const contentBase64 = fileContent.toString('base64');
            
            const response = await axios.put(
                `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/screenshots/${fileName}`,
                {
                    message: `Add screenshot for session ${sessionId}`,
                    content: contentBase64,
                    branch: GITHUB_BRANCH
                },
                {
                    headers: {
                        'Authorization': `Bearer ${GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'YouTube Viewer'
                    }
                }
            );
            
            console.log(`   📸 Screenshot uploaded to GitHub: ${response.data.content.html_url}`);
            return response.data.content.html_url;
        } catch (error) {
            console.error('   ⚠️ Failed to upload screenshot to GitHub:', error.message);
            return null;
        }
    }
}

class SessionRunner {
    constructor(proxyManager, userAgentManager, videoManager, githubUploader) {
        this.proxyManager = proxyManager;
        this.userAgentManager = userAgentManager;
        this.videoManager = videoManager;
        this.githubUploader = githubUploader;
        this.screenshotDir = path.join(__dirname, 'screenshots');
    }

    async ensureScreenshotDir() {
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    async runSession(sessionId) {
        const proxy = this.proxyManager.getRandomProxy();
        const userAgent = this.userAgentManager.getRandomUserAgent();
        const video = this.videoManager.getRandomVideo();

        console.log(`\n🚀 Starting session #${sessionId}`);
        console.log(`   Proxy: ${proxy || 'DIRECT CONNECTION'}`);
        console.log(`   Video: ${video}`);
        console.log(`   User Agent: ${userAgent.slice(0, 60)}...`);

        const browserArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--mute-audio',
            `--user-agent=${userAgent}`
        ];

        if (proxy) {
            browserArgs.push(`--proxy-server=http://${proxy}`);
        }

        const browser = await puppeteer.launch({
            headless: "new",
            args: browserArgs,
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();
        
        try {
            await this.ensureScreenshotDir();
            
            // Set random viewport
            const width = Math.floor(Math.random() * (1920 - 1200)) + 1200;
            const height = Math.floor(Math.random() * (1080 - 800)) + 800;
            await page.setViewport({ width, height, deviceScaleFactor: 1 });

            // Set stealth parameters
            await page.evaluateOnNewDocument(() => {
                delete navigator.__proto__.webdriver;
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => Math.floor(Math.random() * 4) + 2,
                });
            });

            // Block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', req => {
                const resourceType = req.resourceType();
                if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            console.log(`   🌐 Navigating to video...`);
            await page.goto(video, {
                waitUntil: 'networkidle2',
                timeout: 90000
            });

            await this.handleAds(page);

            // Enhanced video player detection
            console.log(`   ⏳ Checking for video player...`);
            let playerFound = false;
            
            try {
                // Try to find video player using multiple methods
                await page.waitForSelector('video', { timeout: 30000 });
                playerFound = true;
                console.log('   ✅ Found video element');
            } catch (err) {
                console.log('   ⚠️ Video element not found, trying fallback');
            }
            
            if (!playerFound) {
                try {
                    await page.waitForFunction(() => {
                        return document.querySelector('video') || 
                               document.querySelector('.html5-video-player') ||
                               document.querySelector('#player-container');
                    }, { timeout: 30000 });
                    playerFound = true;
                    console.log('   ✅ Video player detected via JavaScript');
                } catch (err) {
                    console.log('   ⚠️ Could not detect video player with JavaScript');
                }
            }
            
            if (!playerFound) {
                const screenshotPath = path.join(this.screenshotDir, `error-${sessionId}.png`);
                await page.screenshot({ path: screenshotPath });
                console.log(`   📸 Saved screenshot to ${screenshotPath}`);
                
                // Upload to GitHub
                await this.githubUploader.uploadScreenshot(screenshotPath, sessionId);
                
                // Check for YouTube errors
                const errorText = await page.evaluate(() => {
                    return document.querySelector('#error-message')?.textContent.trim() || '';
                });
                
                if (errorText) {
                    throw new Error(`YouTube error: ${errorText}`);
                }
                
                throw new Error('Video player not found after all detection methods');
            }

            // Simulate human-like viewing behavior
            await this.simulateHumanBehavior(page);

            const watchTime = Math.floor(Math.random() * (90000 - 30000)) + 30000;
            console.log(`   ⏱️ Watching for ${Math.round(watchTime/1000)} seconds`);
            
            // Simulate activity during viewing
            const startTime = Date.now();
            while (Date.now() - startTime < watchTime) {
                await this.simulateHumanBehavior(page);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            console.log(`✅ Session #${sessionId} completed`);
            return true;
        } catch (error) {
            console.error(`   ⚠️ Session error: ${error.message}`);
            
            // Save screenshot on error
            try {
                const screenshotPath = path.join(this.screenshotDir, `error-${sessionId}.png`);
                await page.screenshot({ path: screenshotPath });
                console.log(`   📸 Saved error screenshot to ${screenshotPath}`);
                
                // Upload to GitHub
                await this.githubUploader.uploadScreenshot(screenshotPath, sessionId);
            } catch (screenshotError) {
                console.error('   ⚠️ Failed to save screenshot:', screenshotError.message);
            }
            
            return false;
        } finally {
            await browser.close();
        }
    }

    async handleAds(page) {
        try {
            // Handle consent dialog
            await page.waitForSelector('button:has-text("Accept"), button:has-text("AGREE")', { timeout: 5000 });
            await page.click('button:has-text("Accept"), button:has-text("AGREE")');
            console.log('   ✅ Accepted consent dialog');
        } catch {}

        try {
            // Skip video ads
            await page.waitForSelector('.ytp-ad-skip-button', { timeout: 3000 });
            await page.click('.ytp-ad-skip-button');
            console.log('   ⏩ Skipped video ad');
        } catch {}

        try {
            // Close banner ads
            await page.waitForSelector('.ytp-ad-overlay-close-button', { timeout: 3000 });
            await page.click('.ytp-ad-overlay-close-button');
            console.log('   🚫 Closed banner ad');
        } catch {}
    }

    async simulateHumanBehavior(page) {
        try {
            // Random mouse movements
            const viewport = page.viewport();
            const steps = Math.floor(Math.random() * 5) + 3;
            for (let i = 0; i < steps; i++) {
                const x = Math.random() * viewport.width;
                const y = Math.random() * viewport.height;
                await page.mouse.move(x, y, { steps: 10 });
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Random scrolling
            const scrollAmount = Math.floor(Math.random() * 500) + 200;
            await page.evaluate(scrollAmount => {
                window.scrollBy(0, scrollAmount);
            }, scrollAmount);
            
            // Random pauses
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 3000));
            
            // Random keyboard interactions
            if (Math.random() > 0.7) {
                await page.keyboard.press('Space');
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 4000));
                await page.keyboard.press('Space');
            }
            
        } catch (error) {
            console.log('   ⚠️ Human behavior simulation error:', error.message);
        }
    }
}

// Main execution
(async () => {
    try {
        const proxyManager = new ProxyManager();
        const userAgentManager = new UserAgentManager();
        const videoManager = new VideoManager();
        const githubUploader = new GitHubUploader();
        
        await Promise.all([
            proxyManager.initialize(),
            userAgentManager.initialize(),
            videoManager.initialize()
        ]);

        await proxyManager.findWorkingProxies();
        
        if (proxyManager.workingProxies.length === 0) {
            console.warn('⚠️ No working proxies found. Using direct connection');
        } else {
            console.log(`💡 Using ${proxyManager.workingProxies.length} verified proxies`);
        }

        const sessionRunner = new SessionRunner(
            proxyManager, 
            userAgentManager, 
            videoManager,
            githubUploader
        );
        
        const SESSION_COUNT = 5;
        const results = [];
        
        console.log(`\n🚀 Starting ${SESSION_COUNT} sessions`);
        
        for (let i = 1; i <= SESSION_COUNT; i++) {
            const success = await sessionRunner.runSession(i);
            results.push(success);
            
            if (i < SESSION_COUNT) {
                const delay = Math.floor(Math.random() * 30000) + 10000;
                console.log(`\n⏳ Waiting ${Math.round(delay/1000)}s before next session...`);
                await setTimeout(delay);
            }
        }
        
        const successCount = results.filter(Boolean).length;
        console.log(`\n🎉 Completed ${SESSION_COUNT} sessions. Successful: ${successCount}/${SESSION_COUNT}`);
    } catch (error) {
        console.error(`\n❌ Fatal error: ${error.message}`);
        process.exit(1);
    }
})();
