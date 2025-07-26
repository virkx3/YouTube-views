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
  { username: "follow_iamvirk", password: "virksaab", sessionFile: "follow_iamvirk.json" },
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

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
  await saveSession(page, account.sessionFile);
  console.log(`✅ Logged in: @${account.username}`);
}

// ------------------- STORY VIEW + LIKE -------------------
async function watchAndLikeStory(page, username) {
  const url = `https://www.instagram.com/stories/${username}/`;
  console.log(`👀 Visiting stories: ${url}`);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch {
    console.log(`⚠️ Could not load ${url} — skipping`);
    return true;
  }

  const currentUrl = page.url();
  if (!currentUrl.includes("/stories/")) {
    console.log(`❌ No story — redirected to profile`);
    return true;
  }

  await randomDelay(2000, 4000);

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
      const c = document.getElementById('fake-cursor');
      if (c) {
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
      }
    }, x, y);
    await page.mouse.move(x, y);
  };

  let opened = false;

  try {
    const [btn] = await page.$x("//button[contains(., 'View story')]");
    if (btn) {
      await moveCursor(600, 400);
      await btn.click();
      console.log(`✅ Clicked "View Story"`);
      opened = true;
    }
  } catch {}

  if (!opened) {
    for (let i = 1; i <= 20; i++) {
      const x = 595 + Math.floor(Math.random() * 30);
      const y = 455 + Math.floor(Math.random() * 20);
      await moveCursor(x, y);
      await page.mouse.click(x, y);
      await delay(100);

      const like = await page.$('svg[aria-label="Like"]');
      const close = await page.$('button[aria-label="Close"]');
      if (like || close) {
        opened = true;
        console.log(`✅ Fallback click worked on try ${i}`);
        break;
      }
    }
  }

  if (!opened) {
    console.log(`❌ No story opened for @${username}`);
    return true;
  }

  const maxStories = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < maxStories; i++) {
    let liked = false;
    const likeBtn = await page.$('svg[aria-label="Like"]');
    if (likeBtn) {
      const box = await likeBtn.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await moveCursor(x, y);
        await page.mouse.click(x, y);
        liked = true;
        console.log(`❤️ Liked story`);
      }
    }

    if (!liked) {
      console.log(`💨 No like button found`);
    }

    const nextBtn = await page.$('button[aria-label="Next"]');
    if (nextBtn) {
      await nextBtn.click();
      console.log(`➡️ Next story`);
      await randomDelay(1000, 3000);
    } else {
      console.log(`⏹️ No more stories`);
      break;
    }
  }

  await randomDelay(1000, 3000);
  return true;
}

// ✅ Only reads, never writes usernames.txt
async function fetchUsernamesFromPrivateRepo() {
  const url = `https://api.github.com/repos/${REPO}/contents/data2/${USERNAMES}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3.raw",
  };

  try {
    const res = await axios.get(url, { headers });
    let lines = res.data.split("\n").map(line => line.trim()).filter(Boolean);
    const top20 = lines.slice(0, 20);

    if (top20.length === 0) {
      console.log(`⚠️ No usernames left to process.`);
    } else {
      console.log(`📥 Grabbed top ${top20.length} usernames`);
    }

    return top20;
  } catch (err) {
    console.log(`❌ Failed to fetch usernames: ${err.message}`);
    return [];
  }
}

function isSleepTime() {
  const now = dayjs().tz("Asia/Kolkata");
  const h = now.hour();
  return h >= 22 || h < 8;
}

async function runMainAccount(account) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.setUserAgent("Mozilla/5.0");

  const hasSession = await loadSession(page, account.sessionFile);
  if (!hasSession) await login(page, account);

  const usernames = await fetchUsernamesFromPrivateRepo();
  if (!usernames.length) {
    console.log("⚠️ No usernames to process");
    await browser.close();
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

    for (const account of MAIN_ACCOUNTS) {
      await runMainAccount(account);
    }

    const breakMs = Math.floor(Math.random() * (4 - 2 + 1) + 2) * 60 * 1000;
    console.log(`⏸️ Waiting ${Math.round(breakMs / 60000)} minutes before next cycle...`);
    await delay(breakMs);

    console.log("🔄 Cycle complete. Restarting soon...");
    await delay(60 * 1000);
  }
})();
