const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { setTimeout } = require('timers/promises');
const fs = require('fs/promises');
const path = require('path');

puppeteer.use(StealthPlugin());

// Improved proxy sources with higher reliability
const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
  'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt',
  'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=socks5'
];

const USER_AGENT_SOURCES = [
  'https://raw.githubusercontent.com/monperrus/crawler-user-agents/master/crawler-user-agents.json',
  'https://gist.githubusercontent.com/pzb/b4b6f57144aea7827ae4/raw/cf847b76a142955b1410c8bcef3aabe221a63db1/user-agents.txt'
];

// Persistent storage for proxies and user agents
const DATA_DIR = path.join(__dirname, 'data');
const PROXY_FILE = path.join(DATA_DIR, 'proxies.json');
const USER_AGENT_FILE = path.join(DATA_DIR, 'user_agents.json');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('❌ Could not create data directory:', err);
  }
}

async function fetchResource(url, isJson = false) {
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return isJson ? response.data : response.data.split(/\r?\n/).filter(Boolean);
  } catch (err) {
    console.error(`Failed to fetch ${url}:`, err.message);
    return [];
  }
}

async function getProxies() {
  await ensureDataDir();
  
  try {
    const cached = await fs.readFile(PROXY_FILE, 'utf8');
    const { proxies, timestamp } = JSON.parse(cached);
    // Use cache if less than 4 hours old
    if (Date.now() - timestamp < 4 * 60 * 60 * 1000) {
      return proxies;
    }
  } catch (err) {
    /* Cache not available */
  }

  console.log('🔍 Fetching fresh proxies...');
  const lists = await Promise.all(
    PROXY_SOURCES.map(url => fetchResource(url))
  );
  
  const proxies = [...new Set(lists.flat())];
  const payload = {
    proxies,
    timestamp: Date.now()
  };
  
  await fs.writeFile(PROXY_FILE, JSON.stringify(payload));
  return proxies;
}

async function testProxy(proxy) {
  try {
    const agent = new HttpsProxyAgent(`socks5://${proxy}`);
    await axios.get('https://www.youtube.com', {
      timeout: 5000,
      httpsAgent: agent,
      headers: { 'Accept-Encoding': 'gzip' }
    });
    return proxy;
  } catch (err) {
    return null;
  }
}

async function getWorkingProxies(proxies, maxTests = 100) {
  console.log(`🧪 Testing ${Math.min(maxTests, proxies.length)} proxies...`);
  const testBatch = proxies.slice(0, maxTests);
  const results = await Promise.all(
    testBatch.map(proxy => testProxy(proxy))
  );
  return results.filter(Boolean);
}

async function getUserAgents() {
  await ensureDataDir();
  
  try {
    const cached = await fs.readFile(USER_AGENT_FILE, 'utf8');
    return JSON.parse(cached);
  } catch (err) {
    /* Cache not available */
  }

  console.log('🔍 Fetching user agents...');
  const data = await fetchResource(USER_AGENT_SOURCES[0], true);
  let agents = [];
  
  if (data && Array.isArray(data)) {
    agents = data
      .filter(entry => entry.platform === 'windows' || entry.platform === 'linux')
      .map(entry => entry.instances.map(i => i.userAgent))
      .flat();
  }
  
  // Fallback to text file if JSON fails
  if (agents.length === 0) {
    agents = await fetchResource(USER_AGENT_SOURCES[1]);
  }

  await fs.writeFile(USER_AGENT_FILE, JSON.stringify(agents));
  return agents;
}

async function getVideoUrls() {
  try {
    const response = await axios.get(
      'https://raw.githubusercontent.com/virkx3/otp/main/youtube.txt',
      { timeout: 10000 }
    );
    return response.data.split('\n').filter(Boolean);
  } catch (err) {
    console.error('❌ Failed to fetch videos:', err.message);
    return [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      'https://www.youtube.com/watch?v=9bZkp7q19f0'
    ];
  }
}

function humanRandom(min, max) {
  // Skew towards lower values for more natural behavior
  const skew = 0.7; 
  const range = max - min;
  return min + Math.floor(range * (Math.random() ** skew));
}

async function simulateHumanInteraction(page) {
  const viewport = page.viewport();
  if (!viewport) return;

  // Realistic mouse movement with Bezier curves
  await page.mouse.move(
    humanRandom(50, viewport.width - 50),
    humanRandom(50, viewport.height - 50),
    { steps: humanRandom(10, 30) }
  );

  // Random scrolling patterns
  const scrollCount = humanRandom(3, 8);
  for (let i = 0; i < scrollCount; i++) {
    await page.evaluate(() => {
      window.scrollBy({
        top: window.innerHeight * (0.3 + Math.random() * 0.5),
        behavior: 'smooth'
      });
    });
    await page.waitForTimeout(humanRandom(800, 3000));
  }

  // Random keyboard interactions
  if (Math.random() > 0.7) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(humanRandom(1000, 5000));
  }
}

async function watchVideo(page, url) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Skip ads and consent dialogs
    try {
      await page.waitForSelector('.ytp-ad-skip-button, .ytp-ad-overlay-close-button', { timeout: 5000 });
      await page.click('.ytp-ad-skip-button, .ytp-ad-overlay-close-button');
      console.log('⏩ Skipped ad/dialog');
    } catch (err) {
      /* No ad found */
    }

    // Wait for video player
    await page.waitForSelector('.html5-video-player', { timeout: 15000 });

    // Simulate human-like interaction
    await simulateHumanInteraction(page);

    // Watch duration with activity
    const watchTime = humanRandom(60 * 1000, 300 * 1000); // 1-5 minutes
    const start = Date.now();
    
    while (Date.now() - start < watchTime) {
      await simulateHumanInteraction(page);
      await page.waitForTimeout(humanRandom(5000, 15000));
      
      // Random pause/resume
      if (Math.random() > 0.8) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(humanRandom(2000, 8000));
        await page.keyboard.press('Space');
      }
    }

    return true;
  } catch (err) {
    console.error(`⚠️ Video error: ${err.message}`);
    return false;
  }
}

async function runSession(sessionId, proxies, userAgents, videos) {
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  const video = videos[Math.floor(Math.random() * videos.length)];
  
  console.log(`\n🚀 Session #${sessionId}`);
  console.log(`🌐 Proxy: ${proxy}`);
  console.log(`📺 Video: ${video}`);
  console.log(`🕵️ UA: ${userAgent.slice(0, 60)}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--proxy-server=socks5://${proxy}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-infobars',
      '--window-position=0,0',
      `--user-agent=${userAgent}`
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Configure viewport and media settings
    await page.setViewport({
      width: humanRandom(1200, 1920),
      height: humanRandom(800, 1080),
      deviceScaleFactor: 1,
      isMobile: Math.random() > 0.7
    });

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'font', 'media'].includes(type) && Math.random() > 0.3) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Execute watching sequence
    const success = await watchVideo(page, video);
    
    if (success) {
      console.log(`✅ Session #${sessionId} completed successfully`);
      return { success: true };
    }
  } catch (err) {
    console.error(`🔥 Session #${sessionId} crashed: ${err.message}`);
  } finally {
    await browser.close();
  }
  
  return { success: false };
}

(async () => {
  try {
    const [proxies, userAgents, videos] = await Promise.all([
      getProxies(),
      getUserAgents(),
      getVideoUrls()
    ]);

    console.log(`\n📦 Resources loaded:`);
    console.log(`   Proxies: ${proxies.length}`);
    console.log(`   User Agents: ${userAgents.length}`);
    console.log(`   Videos: ${videos.length}`);

    const workingProxies = await getWorkingProxies(proxies);
    console.log(`\n✅ Working proxies: ${workingProxies.length}`);
    
    if (workingProxies.length === 0) {
      throw new Error('No working proxies available');
    }

    // Run sessions with concurrency control
    const CONCURRENCY = 3;
    const TOTAL_SESSIONS = 10;
    const sessionQueue = Array.from({ length: TOTAL_SESSIONS }, (_, i) => i + 1);
    
    console.log(`\n🚦 Starting ${TOTAL_SESSIONS} sessions with ${CONCURRENCY}x concurrency...`);
    
    const results = { success: 0, failure: 0 };
    while (sessionQueue.length > 0) {
      const batch = sessionQueue.splice(0, CONCURRENCY);
      await Promise.all(batch.map(async sessionId => {
        const result = await runSession(sessionId, workingProxies, userAgents, videos);
        results[result.success ? 'success' : 'failure']++;
      }));
      await setTimeout(10000); // Cool-down period
    }
    
    console.log(`\n🎯 Final Results:`);
    console.log(`   Successful: ${results.success}`);
    console.log(`   Failed: ${results.failure}`);
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
})();
