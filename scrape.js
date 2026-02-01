import fs from 'fs';
import path from 'path';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ensure debug directory exists for screenshots
const debugDir = './debug';
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
}

async function safeGoto(page, url, retries = 3) {
  // 1. INJECT COOKIES
  try {
    if (fs.existsSync('./cookies.json')) {
      const cookies = JSON.parse(fs.readFileSync('./cookies.json', 'utf8'));
      await page.setCookie(...cookies);
      console.log("[Status] SUCCESS: Cookies applied to session.");
    }
  } catch (err) {
    console.warn("[Status] Cookie Injection skipped or failed.");
  }

  // Set real browser headers
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Status] Navigation Attempt ${i + 1} for ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      // 2. VERIFY LOGIN
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('button[name="header-user-menu-button"], .tv-header__user-menu-button--user');
      });
      console.log(`[Status] Login Verified: ${isLoggedIn ? "YES ✅" : "NO ❌"}`);

      // 📸 DEBUG SCREENSHOT: Check state regardless of success
      const screenshotName = `batch_debug_attempt_${i}_${isLoggedIn ? 'logged_in' : 'guest'}.png`;
      await page.screenshot({ path: path.join(debugDir, screenshotName), fullPage: false });

      // 3. WAIT FOR CHART ENGINE
      await page.waitForSelector('[data-qa-id="legend"]', { timeout: 20000 });
      
      // Force click the chart area to activate calculation engine
      const view = page.viewport();
      await page.mouse.click(view.width / 2, view.height / 2);

      // 4. WAIT FOR ACTUAL NUMBERS (Avoid ∅)
      console.log("[Status] Waiting for indicator values to calculate...");
      const dataReady = await page.waitForFunction(() => {
        const sections = document.querySelectorAll('[data-qa-id="legend"] .item-l31H9iuA.study-l31H9iuA');
        const target = Array.from(sections).find(s => {
          const title = s.querySelector('[data-qa-id="legend-source-title"] .title-l31H9iuA')?.innerText?.toLowerCase();
          return title === "clubbed" || title === "l";
        });
        if (!target) return false;

        // Force-click the indicator title once to jumpstart data
        const titleEl = target.querySelector('.title-l31H9iuA');
        if (titleEl && !window.hasForcedClick) {
          titleEl.click();
          window.hasForcedClick = true;
        }

        const firstVal = target.querySelector(".valueValue-l31H9iuA")?.innerText || "";
        return /[0-9.-]/.test(firstVal); // Returns true only if it contains a digit/decimal
      }, { timeout: 35000, polling: 1000 }).catch(() => false);

      if (dataReady) {
        console.log("[Status] SUCCESS: Numbers detected in indicator.");
        return true;
      }
      
      console.warn(`[Status] Values stayed ∅ on attempt ${i + 1}.`);
    } catch (err) {
      console.warn(`Retry ${i + 1} failed: ${err.message}`);
      if (i === retries - 1) return false;
      await delay(3000);
    }
  }
}

function fixedLength(arr, len, fill = "") {
  if (arr.length >= len) return arr.slice(0, len);
  return arr.concat(Array(len - arr.length).fill(fill));
}

function buildDate(day, month, year) {
  if (!year) return "";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export async function scrapeChart(page, url) {
  const EXPECTED_VALUE_COUNT = 25;

  try {
    const success = await safeGoto(page, url);

    const now = new Date();
    const dateString = buildDate(now.getDate(), now.getMonth() + 1, now.getFullYear());

    if (!success) {
      return ["", "", dateString, ...fixedLength(["TIMEOUT/FAILED"], EXPECTED_VALUE_COUNT - 1)];
    }

    const values = await page.$$eval(
      '[data-qa-id="legend"] .item-l31H9iuA.study-l31H9iuA',
      (sections) => {
        const clubbed = [...sections].find((section) => {
          const title = section.querySelector('[data-qa-id="legend-source-title"] .title-l31H9iuA');
          const text = title?.innerText?.trim().toLowerCase();
          return text === "clubbed" || text === "l";
        });

        if (!clubbed) return ["INDICATOR NOT FOUND"];

        const valueSpans = clubbed.querySelectorAll(".valueValue-l31H9iuA");
        return [...valueSpans].map((el) => {
          const t = el.innerText.trim();
          return (t === "∅" || t === "") ? "None" : t;
        });
      }
    );

    console.log(`[Status] Scrape Complete: Found ${values.length} values.`);
    return ["", "", dateString, ...fixedLength(values, EXPECTED_VALUE_COUNT - 1)];

  } catch (err) {
    console.error(`Error scraping ${url}:`, err.message);
    return ["", "", "ERROR", ...fixedLength([err.message], EXPECTED_VALUE_COUNT - 1)];
  }
}
