const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const net = require('net');
const { setTimeout } = require('timers/promises');

puppeteer.use(StealthPlugin());

// Proxy sources
const PROXY_SOURCES = [
    'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc',
    'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/http.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'
];

const USER_AGENT_SOURCES = [
    'https://raw.githubusercontent.com/tamimibrahim17/List-of-user-agents/master/Chrome.txt',
    'https://gist.githubusercontent.com/pzb/b4b6f57144aea7827ae4/raw/cf847b76a142955b1410c8bcef3aabe221a63db1/user-agents.txt'
];

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.workingProxies = [];
    }

    async initialize() {
        console.log('🔍 Fetching proxies...');
        await this.refreshProxies();
    }

    async refreshProxies() {
        try {
            const results = await Promise.allSettled(
                PROXY_SOURCES.map(url => this.fetchProxies(url))
            );
            
            this.proxies = results.flatMap(result => 
                result.status === 'fulfilled' ? result.value : []
            );
            
            console.log(`💾 Loaded ${this.proxies.length} proxies`);
        } catch (error) {
            console.error('Failed to fetch proxies:', error.message);
            this.proxies = [];
        }
    }

    async fetchProxies(url) {
        try {
            if (url.includes('geonode')) {
                const response = await axios.get(url, { timeout: 10000 });
                return response.data.data.map(p => `${p.ip}:${p.port}`);
            }
            
            const response = await axios.get(url, { timeout: 10000 });
            return response.data.split(/\r?\n/)
                .map(p => p.trim())
                .filter(p => p && net.isIP(p.split(':')[0]) !== 0);
        } catch {
            return [];
        }
    }

    async testProxyConnectivity(proxy) {
        return new Promise(resolve => {
            const [host, port] = proxy.split(':');
            const socket = net.createConnection({
                host: host,
                port: parseInt(port),
                timeout: 3000
            });
            
            socket.on('connect', () => {
                socket.end();
                resolve(true);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            
            socket.on('error', () => resolve(false));
        });
    }

    async testProxyWithYouTube(proxy) {
        try {
            const agent = new HttpsProxyAgent(`http://${proxy}`);
            await axios.get('https://www.youtube.com', {
                timeout: 10000,
                httpsAgent: agent,
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            return true;
        } catch (error) {
            if (error.response && error.response.status === 403) {
                return true;
            }
            return false;
        }
    }

    async verifyProxy(proxy) {
        const isAlive = await this.testProxyConnectivity(proxy);
        if (!isAlive) return false;
        return this.testProxyWithYouTube(proxy);
    }

    async findWorkingProxies(requiredCount = 3, maxTests = 300) {
        console.log('🧪 Verifying proxies...');
        
        const shuffledProxies = [...this.proxies].sort(() => 0.5 - Math.random());
        let tested = 0;
        let found = 0;
        
        for (const proxy of shuffledProxies) {
            if (found >= requiredCount || tested >= maxTests) break;
            
            tested++;
            const isValid = await this.verifyProxy(proxy);
            
            if (isValid) {
                found++;
                this.workingProxies.push(proxy);
                console.log(`✅ Working proxy: ${proxy} (${found}/${requiredCount})`);
            }
            
            if (tested % 50 === 0) {
                console.log(`   Tested ${tested} proxies, found ${found} working`);
            }
        }
        
        console.log(`🔚 Tested ${tested} proxies, found ${found} working`);
        return this.workingProxies;
    }

    getRandomProxy() {
        if (this.workingProxies.length > 0) {
            return this.workingProxies[Math.floor(Math.random() * this.workingProxies.length)];
        }
        return null;
    }
}

class UserAgentManager {
    constructor() {
        this.userAgents = [];
    }

    async initialize() {
        console.log('🔍 Fetching user agents...');
        try {
            const results = await Promise.allSettled(
                USER_AGENT_SOURCES.map(url => this.fetchUserAgents(url))
            );
            
            this.userAgents = results.flatMap(result => 
                result.status === 'fulfilled' ? result.value : []
            );
            
            console.log(`💾 Loaded ${this.userAgents.length} user agents`);
        } catch (error) {
            console.error('Failed to fetch user agents:', error.message);
            this.userAgents = this.getDefaultUserAgents();
        }
    }

    async fetchUserAgents(url) {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            return response.data.split(/\r?\n/)
                .map(ua => ua.trim())
                .filter(ua => ua.length > 0);
        } catch {
            return [];
        }
    }

    getDefaultUserAgents() {
        return [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
        ];
    }

    getRandomUserAgent() {
        if (this.userAgents.length > 0) {
            return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
        }
        return this.getDefaultUserAgents()[0];
    }
}

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
            this.videos = response.data.split('\n')
                .map(v => v.trim())
                .filter(v => v.length > 0);
            
            if (this.videos.length === 0) {
                this.videos = this.getDefaultVideos();
            }
        } catch {
            this.videos = this.getDefaultVideos();
        }
        console.log(`💾 Loaded ${this.videos.length} videos`);
    }

    getDefaultVideos() {
        return [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://www.youtube.com/watch?v=jNQXAC9IVRw',
            'https://www.youtube.com/watch?v=9bZkp7q19f0'
        ];
    }

    getRandomVideo() {
        return this.videos[Math.floor(Math.random() * this.videos.length)];
    }
}

class SessionRunner {
    constructor(proxyManager, userAgentManager, videoManager) {
        this.proxyManager = proxyManager;
        this.userAgentManager = userAgentManager;
        this.videoManager = videoManager;
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
            `--user-agent=${userAgent}`
        ];

        if (proxy) {
            browserArgs.push(`--proxy-server=http://${proxy}`);
        }

        const browser = await puppeteer.launch({
            headless: true,
            args: browserArgs
        });

        const page = await browser.newPage();
        
        try {
            const width = Math.floor(Math.random() * (1920 - 1200)) + 1200;
            const height = Math.floor(Math.random() * (1080 - 800)) + 800;
            await page.setViewport({ width, height, deviceScaleFactor: 1 });

            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'font', 'stylesheet', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            console.log(`   🌐 Navigating to video...`);
            await page.goto(video, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            await this.handleAds(page);

            // Increased timeout to 30 seconds
            console.log(`   ⏳ Waiting for video player (30s timeout)...`);
            try {
                await page.waitForSelector('.html5-video-player', { timeout: 30000 });
            } catch (error) {
                console.log('   ⚠️ Video player not found, checking if video exists');
                const videoExists = await page.evaluate(() => {
                    return document.querySelector('video') !== null;
                });
                if (!videoExists) {
                    throw new Error('Video player not found after extended timeout');
                }
            }

            const watchTime = Math.floor(Math.random() * (90000 - 30000)) + 30000;
            console.log(`   ⏱️ Watching for ${Math.round(watchTime/1000)} seconds`);
            
            // Use native setTimeout instead of waitForTimeout
            await new Promise(resolve => setTimeout(resolve, watchTime));

            console.log(`✅ Session #${sessionId} completed`);
            return true;
        } catch (error) {
            console.error(`   ⚠️ Session error: ${error.message}`);
            return false;
        } finally {
            await browser.close();
        }
    }

    async handleAds(page) {
        try {
            await page.waitForSelector('button:has-text("Accept"), button:has-text("AGREE")', { timeout: 5000 });
            await page.click('button:has-text("Accept"), button:has-text("AGREE")');
            console.log('   ✅ Accepted consent dialog');
        } catch {}

        try {
            await page.waitForSelector('.ytp-ad-skip-button', { timeout: 3000 });
            await page.click('.ytp-ad-skip-button');
            console.log('   ⏩ Skipped video ad');
        } catch {}

        try {
            await page.waitForSelector('.ytp-ad-overlay-close-button', { timeout: 3000 });
            await page.click('.ytp-ad-overlay-close-button');
            console.log('   🚫 Closed banner ad');
        } catch {}
    }
}

// Main execution
(async () => {
    try {
        const proxyManager = new ProxyManager();
        const userAgentManager = new UserAgentManager();
        const videoManager = new VideoManager();
        
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

        const sessionRunner = new SessionRunner(proxyManager, userAgentManager, videoManager);
        
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
