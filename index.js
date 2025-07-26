// ✅ CLEANED SCRIPT: Scraping removed, 2 main accounts enabled, GitHub + username.txt preserved

const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

// ------------------- CONFIG -------------------
const MAIN_ACCOUNTS = [
  { username: "follow_iamvirk5", password: "virksaab", sessionFile: "follow_iamvirk5.json" },
  { username: "follow_iamvirk", password: "virksaab", sessionFile: "follow_iamvirk.json" }, // Optional second account
];

const OTP_URL = "https://raw.githubusercontent.com/virkx3/igbot/refs/heads/main/otp.txt";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.REPO;
const BRANCH = process.env.BRANCH || "main";
const USERNAMES = "usernames.txt";

// ------------------- UTILS -------------------
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
function randomDelay(min, max) {
  return delay(Math.floor(Math.random() * (max - min + 1) + min));
}

async function safeSelector(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return await page.$(selector);
  } catch {
    return null;
  }
}

async function fetchFromGitHub(file) {
  try {
    const res = await axios.get(
      `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data2/${file}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
    );
    console.log(`✅ Fetched ${file}`);
    fs.writeFileSync(file, typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2));
    return res.data;
  } catch (err) {
    console.log(`⚠️ Could not fetch ${file}: ${err.message}`);
    return null;
  }
}

async function uploadToGitHub(remotePath, localPath) {
  const url = `https://api.github.com/repos/${REPO}/contents/data2/${remotePath}`;
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}` };
  const content = fs.readFileSync(localPath);

  try {
    const { data } = await axios.get(url, { headers });
    await axios.put(
      url,
      {
        message: `Update ${remotePath}`,
        content: content.toString("base64"),
        sha: data.sha,
        branch: BRANCH,
      },
      { headers }
    );
    console.log(`✅ Uploaded (updated) ${remotePath}`);
  } catch (err) {
    if (err.response?.status === 404) {
      await axios.put(
        url,
        {
          message: `Create ${remotePath}`,
          content: content.toString("base64"),
          branch: BRANCH,
        },
        { headers }
      );
      console.log(`✅ Uploaded (created) ${remotePath}`);
    } else {
      console.log(`❌ Upload failed: ${err.message}`);
    }
  }
}

// ------------------- SESSION HANDLING -------------------
async function loadSession(page, sessionFile) {
  const raw = await fetchFromGitHub(sessionFile);
  if (!raw) return false;

  try {
    const cookies = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    if (!Array.isArray(cookies) || cookies.length === 0) return false;
    await page.setCookie(...cookies);
    console.log(`🔁 Loaded session: ${sessionFile}`);
    return true;
  } catch {
    return false;
  }
}

async function saveSession(page, sessionFile) {
  const cookies = await page.cookies();
  const valid = cookies.find((c) => c.name === "sessionid");
  if (valid) {
    fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));
    console.log(`✅ Saved local: ${sessionFile}`);
    await uploadToGitHub(sessionFile, sessionFile);
    return true;
  }
  return false;
}

// ------------------- LOGIN -------------------
async function fetchOTP() {
  try {
    const res = await axios.get(OTP_URL);
    const otp = res.data.trim();
    return otp.length >= 4 && otp.length <= 8 ? otp : null;
  } catch {
    return null;
  }
}

async function login(page, account) {
  console.log(`🔐 Logging in: @${account.username}`);
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.type('input[name="username"]', account.username, { delay: 100 });
  await page.type('input[name="password"]', account.password, { delay: 100 });
  await page.click('button[type="submit"]');
  await delay(8000);

  const otpInput = await page.$('input[name="verificationCode"]');
  if (otpInput) {
    console.log("🔐 Waiting OTP...");
    for (let i = 0; i < 60; i++) {
      const otp = await fetchOTP();
      if (otp) {
        console.log(`📩 OTP: ${otp}`);
        await page.type('input[name="verificationCode"]', otp, { delay: 100 });
        await page.click("button[type=button]");
        break;
      }
      await delay(1000);
    }
  }

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await saveSession(page, account.sessionFile);
  console.log(`✅ Logged in: @${account.username}`);
}

// ------------------- STORY VIEW + LIKE -------------------
async function watchAndLikeStory(page, username) {
  const url = `https://www.instagram.com/stories/${username}/`;
  console.log(`👀 Visiting stories: ${url}`);
  await page.goto(url, { waitUntil: "networkidle2" });
  await randomDelay(3000, 5000);

  // Inject fake cursor
  await page.evaluate(() => {
    if (document.getElementById("fake-cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "fake-cursor";
    cursor.style.position = "fixed";
    cursor.style.width = "20px";
    cursor.style.height = "20px";
    cursor.style.border = "2px solid red";
    cursor.style.borderRadius = "50%";
    cursor.style.zIndex = "9999";
    cursor.style.pointerEvents = "none";
    cursor.style.transition = "top 0.05s, left 0.05s";
    document.body.appendChild(cursor);
  });

  const moveCursor = async (x, y) => {
    await page.evaluate((x, y) => {
      const c = document.getElementById("fake-cursor");
      if (c) {
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
      }
    }, x, y);
    await page.mouse.move(x, y);
  };

  let opened = false;

  // 🔁 Fallback clicks only (random tapping to open story)
  for (let i = 1; i <= 20; i++) {
    const x = 600 + Math.floor(Math.random() * 50 - 25);
    const y = 450 + Math.floor(Math.random() * 50 - 25);
    await moveCursor(x, y);
    await page.mouse.click(x, y);
    await delay(700);

    const like = await safeSelector(page, 'svg[aria-label="Like"]');
    const close = await safeSelector(page, 'button[aria-label="Close"]');
    if (like || close) {
      opened = true;
      console.log(`✅ Fallback click worked on try ${i} — story opened!`);
      break;
    }
  }

  if (!opened) {
    console.log(`❌ No story found for @${username} (fallback failed)`);
    return true;
  }

  // ✅ Story opened — like only 1 story
  const likeBtn = await safeSelector(page, 'svg[aria-label="Like"]');
  if (likeBtn) {
    try {
      const isAttached = await page.evaluate(el => document.body.contains(el), likeBtn);
      if (!isAttached) {
        console.log("⚠️ Like button is detached from DOM");
      } else {
        const box = await likeBtn.boundingBox();
        if (box) {
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await moveCursor(x, y);
          await page.mouse.click(x, y);
          console.log("❤️ Liked story");
        } else {
          console.log("⚠️ Like button found but bounding box is missing");
        }
      }
    } catch (err) {
      console.log("❌ Error while trying to like story:", err.message);
    }
  } else {
    console.log("💨 No like button found");
  }

  // Skip next story but show fallback logging
  const nextBtn = await safeSelector(page, 'button[aria-label="Next"]');
  if (nextBtn) {
    console.log("➡️ Next story available (but skipped — only watching 1)");
  } else {
    console.log("⏹️ No more stories");
  }

  await randomDelay(2000, 3000);
  return true;
}
function isSleepTime() {
  const now = dayjs().tz("Asia/Kolkata");
  const h = now.hour();
  return h >= 22 || h < 08;
}

// ------------------- MAIN FLOW -------------------
async function runMainAccount(account) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.setUserAgent("Mozilla/5.0");

  const hasSession = await loadSession(page, account.sessionFile);
  if (!hasSession) await login(page, account);

  const USERNAMES_URL = "https://raw.githubusercontent.com/virkx3/igbot/refs/heads/main/data2/usernames.txt?token=GHSAT0AAAAAADGDFEXE737RX62DANNDSARU2EEPXMQ";

  let usernames = [];
  try {
    const res = await axios.get(USERNAMES_URL);
    const allUsernames = res.data.split("\n").map(l => l.trim()).filter(Boolean);
    usernames = allUsernames.slice(0, 20);
    console.log(`📥 Loaded ${usernames.length} usernames from GitHub`);
  } catch (err) {
    console.log(`❌ Failed to fetch usernames: ${err.message}`);
    return;
  }

  for (const username of usernames) {
    await watchAndLikeStory(page, username);
    await randomDelay(1000, 3000);
  }

  await browser.close();
}

// ------------------- MAIN LOOP -------------------
(async () => {
  while (true) {
    if (isSleepTime()) {
      console.log("🌙 Sleeping 30 min");
      await delay(30 * 60 * 1000);
      continue;
    }

    await Promise.all(MAIN_ACCOUNTS.map(runMainAccount));

    const breakMs = Math.floor(Math.random() * (4 - 2 + 1) + 2) * 60 * 1000;
    console.log(`⏸️ Waiting ${Math.round(breakMs / 60000)} minutes before next cycle...`);
    await delay(breakMs);

    console.log("🔄 Cycle complete. Restarting soon...");
    await delay(60 * 1000);
  }
})();
