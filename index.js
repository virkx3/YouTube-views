const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { setTimeout } = require('timers/promises');

puppeteer.use(StealthPlugin());

// Enhanced proxy sources with better rotation
const PROXY_SOURCES = [
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
    'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/http.txt'
];

const USER_AGENT_SOURCES = [
    'https://gist.githubusercontent.com/pzb/b4b6f57144aea7827ae4/raw/cf847b76a142955b1410c8bcef3aabe221a63db1/user-agents.txt',
    'https://raw.githubusercontent.com/tamimibrahim17/List-of-user-agents/master/Chrome.txt',
    'https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/useragents.txt'
];

// Proxy management class
class ProxyManager {
    constructor() {
        this.proxies = [];
        this.usedProxies = new Set();
        this.lastRefresh = 0;
    }

    async initialize() {
        await this.refreshProxies();
    }

    async refreshProxies() {
        if (Date.now() - this.lastRefresh < 30 * 60 * 1000) return;
        
        console.log('🔍 Fetching fresh proxies...');
        const results = await Promise.all(
            PROXY_SOURCES.map(url => this.fetchProxies(url))
        );
        
        this.proxies = [...new Set(results.flat())];
        this.lastRefresh = Date.now();
        console.log(`💾 Loaded ${this.proxies.length} proxies`);
    }

    async fetchProxies(url) {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            return response.data.split(/\r?\n/).filter(Boolean);
        } catch {
            return [];
        }
    }

    async getWorkingProxies() {
        await this.refreshProxies();
        
        // Filter out used proxies
        const availableProxies = this.proxies.filter(p => !this.usedProxies.has(p));
        
        console.log(`🧪 Testing ${Math.min(100, availableProxies.length)} proxies...`);
        const testSet = availableProxies.slice(0, 100);
        
        const results = await Promise.all(
            testSet.map(proxy => this.testProxy(proxy))
        );
        
        const working = results.filter(Boolean);
        console.log(`✅ Found ${working.length} working proxies`);
        return working;
    }

    async testProxy(proxy) {
        try {
            const agent = new HttpsProxyAgent(`http://${proxy}`);
            await axios.get('https://www.google.com', {
                timeout: 5000,
                httpsAgent: agent
            });
            return proxy;
        } catch {
            return null;
        }
    }

    markProxyUsed(proxy) {
        this.usedProxies.add(proxy);
        
        // Reset used proxies if we're running low
        if (this.usedProxies.size > 50) {
            this.usedProxies.clear();
        }
    }
}

// User agent manager
class UserAgentManager {
    constructor() {
        this.userAgents = [];
    }

    async initialize() {
        console.log('🔍 Fetching user agents...');
        const results = await Promise.all(
            USER_AGENT_SOURCES.map(url => this.fetchUserAgents(url))
        );
        
        this.userAgents = [...new Set(results.flat())];
        console.log(`💾 Loaded ${this.userAgents.length} user agents`);
    }

    async fetchUserAgents(url) {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            return response.data.split(/\r?\n/).filter(Boolean);
        } catch {
            return [];
        }
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)] || 
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }
}

// Video manager
class VideoManager {
    constructor() {
        this.videos = [];
    }

    async initialize() {
        console.log('🔍 Fetching videos...');
        try {
            const response = await axios.get(
                'https://raw.githubusercontent.com/virkx3/otp/main/youtube.txt',
                { timeout: 10000 }
            );
            this.videos = response.data.split('\n').filter(Boolean);
        } catch {
            this.videos = [
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'https://www.youtube.com/watch?v=jNQXAC9IVRw',
                'https://www.youtube.com/watch?v=9bZkp7q19f0'
            ];
        }
        console.log(`💾 Loaded ${this.videos.length} videos`);
    }

    getRandomVideo() {
        return this.videos[Math.floor(Math.random() * this.videos.length)];
    }
}

// Ad skipper
class AdHandler {
    static async handleAds(page) {
        // Handle consent dialog
        try {
            await page.waitForSelector('button:has-text("Accept"), button:has-text("AGREE")', { timeout: 5000 });
            await page.click('button:has-text("Accept"), button:has-text("AGREE")');
            console.log('   ✅ Accepted consent dialog');
        } catch {}

        // Continuous ad monitoring
        const adMonitor = setInterval(async () => {
            try {
                // Skip video ads
                const skipButton = await page.$('.ytp-ad-skip-button');
                if (skipButton) {
                    await skipButton.click();
                    console.log('   ⏩ Skipped video ad');
                }
                
                // Close banner ads
                const closeButton = await page.$('.ytp-ad-overlay-close-button');
                if (closeButton) {
                    await closeButton.click();
                    console.log('   🚫 Closed banner ad');
                }
            } catch {}
        }, 3000);

        return adMonitor;
    }
}

// Human behavior simulator
class HumanSimulator {
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static async simulateBehavior(page) {
        const viewport = page.viewport();
        if (!viewport) return;

        // Realistic mouse movements
        const steps = this.randomInt(5, 15);
        for (let i = 0; i < steps; i++) {
            await page.mouse.move(
                this.randomInt(50, viewport.width - 50),
                this.randomInt(50, viewport.height - 50),
                { steps: this.randomInt(5, 15) }
            );
            await page.waitForTimeout(this.randomInt(300, 1200));
        }

        // Natural scrolling
        const scrolls = this.randomInt(3, 8);
        for (let i = 0; i < scrolls; i++) {
            const scrollDistance = this.randomInt(200, viewport.height * 0.7);
            await page.evaluate(scrollDistance => {
                window.scrollBy(0, scrollDistance);
            }, scrollDistance);
            await page.waitForTimeout(this.randomInt(800, 2500));
        }
    }
}

// Main session runner
class SessionRunner {
    constructor(proxyManager, userAgentManager, videoManager) {
        this.proxyManager = proxyManager;
        this.userAgentManager = userAgentManager;
        this.videoManager = videoManager;
    }

    async runSession(sessionId) {
        // Get fresh resources
        const workingProxies = await this.proxyManager.getWorkingProxies();
        if (workingProxies.length === 0) {
            throw new Error('No working proxies available');
        }

        // Select unique proxy for this session
        const availableProxies = workingProxies.filter(p => !this.proxyManager.usedProxies.has(p));
        const proxy = availableProxies.length > 0 
            ? availableProxies[Math.floor(Math.random() * availableProxies.length)]
            : workingProxies[Math.floor(Math.random() * workingProxies.length)];
        
        this.proxyManager.markProxyUsed(proxy);
        const userAgent = this.userAgentManager.getRandomUserAgent();
        const video = this.videoManager.getRandomVideo();

        console.log(`\n🚀 Starting session #${sessionId}`);
        console.log(`   Proxy: ${proxy}`);
        console.log(`   Video: ${video}`);
        console.log(`   User Agent: ${userAgent.slice(0, 60)}...`);

        const browser = await puppeteer.launch({
            headless: true,
            args: [
                `--proxy-server=http://${proxy}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                `--user-agent=${userAgent}`
            ]
        });

        const page = await browser.newPage();
        let adMonitor;
        
        try {
            // Configure browser
            await page.setViewport({
                width: HumanSimulator.randomInt(1200, 1920),
                height: HumanSimulator.randomInt(800, 1080),
                deviceScaleFactor: 1
            });

            // Block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Navigate to video
            await page.goto(video, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            // Set up ad handling
            adMonitor = await AdHandler.handleAds(page);

            // Wait for video player
            await page.waitForSelector('.html5-video-player', { timeout: 15000 });

            // Simulate human behavior
            await HumanSimulator.simulateBehavior(page);
            
            // Watch for 2-5 minutes
            const watchTime = HumanSimulator.randomInt(120000, 300000);
            console.log(`   ⏱️ Watching for ${Math.round(watchTime/1000)} seconds`);
            
            const startTime = Date.now();
            while (Date.now() - startTime < watchTime) {
                await HumanSimulator.simulateBehavior(page);
                await page.waitForTimeout(HumanSimulator.randomInt(5000, 15000));
            }

            console.log(`✅ Session #${sessionId} completed successfully`);
            return true;
        } catch (error) {
            console.error(`   ⚠️ Session error: ${error.message}`);
            return false;
        } finally {
            if (adMonitor) clearInterval(adMonitor);
            await browser.close();
        }
    }
}

// Main execution
(async () => {
    try {
        // Initialize managers
        const proxyManager = new ProxyManager();
        const userAgentManager = new UserAgentManager();
        const videoManager = new VideoManager();
        
        await Promise.all([
            proxyManager.initialize(),
            userAgentManager.initialize(),
            videoManager.initialize()
        ]);

        // Create session runner
        const sessionRunner = new SessionRunner(proxyManager, userAgentManager, videoManager);
        
        // Run sessions with delays
        const SESSION_COUNT = 10;
        const CONCURRENCY = 3;
        
        console.log(`\n🚀 Starting ${SESSION_COUNT} sessions with ${CONCURRENCY}x concurrency`);
        
        const results = [];
        const sessionQueue = Array.from({ length: SESSION_COUNT }, (_, i) => i + 1);
        
        while (sessionQueue.length > 0) {
            const batch = sessionQueue.splice(0, CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(sessionId => sessionRunner.runSession(sessionId))
            );
            results.push(...batchResults);
            
            // Add delay between batches
            if (sessionQueue.length > 0) {
                const delay = HumanSimulator.randomInt(10000, 30000);
                console.log(`\n⏳ Waiting ${Math.round(delay/1000)}s before next batch...`);
                await setTimeout(delay);
            }
        }
        
        // Report results
        const successCount = results.filter(Boolean).length;
        console.log(`\n🎉 Completed ${SESSION_COUNT} sessions. Successful: ${successCount}/${SESSION_COUNT}`);
    } catch (error) {
        console.error(`\n❌ Fatal error: ${error.message}`);
        process.exit(1);
    }
})();
