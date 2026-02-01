// scraper.js (UPDATED FOR "INDICATOR NOT FOUND" ISSUE)

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// ✅ Put multiple possible names here (whatever your indicator shows as in legend)
const INDICATOR_KEYWORDS = [
  "clubbed",        // main keyword
  // "clubbed v2",
  // "clubbed (raj)",
  // "club",         // add more ONLY if needed
];

async function safeGoto(page, url, retries = 3) {
  await page.setUserAgent(UA);

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Navigation] Attempt ${i + 1}: ${url}`);
      await page.goto(url, { waitUntil: "load", timeout: 60000 });

      await killPopups(page);

      await page.waitForFunction(() => {
        const canvas = document.querySelector("canvas");
        return canvas && canvas.offsetWidth > 0;
      }, { timeout: 25000 });

      await delay(3500);
      await killPopups(page);

      return true;
    } catch (err) {
      console.warn(`[Warning] Attempt ${i + 1} failed: ${err.message}`);
      await killPopups(page).catch(() => {});
      if (i === retries - 1) return false;
      await delay(5000);
    }
  }
}

async function killPopups(page) {
  try {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      document.documentElement.style.setProperty("overflow", "auto", "important");
      document.body.style.setProperty("overflow", "auto", "important");

      const selectors = [
        "#overlap-manager-root",
        '[class*="overlap-manager"]',
        '[class*="dialog-"]',
        '[role="dialog"]',
        ".tv-dialog__close",
        ".js-dialog__close",
        'button[name="close"]',
        '[data-role="toast-container"]',
        ".modal-backdrop",
      ];

      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });

      // cookie / consent
      const buttons = Array.from(document.querySelectorAll("button"));
      const consentBtn = buttons.find((b) => {
        const t = (b.innerText || "").toLowerCase();
        return t.includes("accept") || t.includes("agree") || t.includes("got it");
      });
      if (consentBtn) consentBtn.click();
    });
  } catch (e) {}
}

// keep same column count
function fixedLength(arr, len, fill = "") {
  if (arr.length >= len) return arr.slice(0, len);
  return arr.concat(Array(len - arr.length).fill(fill));
}

function buildDate(day, month, year) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export async function scrapeChart(page, url) {
  const EXPECTED_VALUE_COUNT = 25;

  try {
    await page.setViewport({ width: 1920, height: 1080 });

    const success = await safeGoto(page, url);
    if (!success) {
      console.error(`[Error] Navigation failed permanently for: ${url}`);
      return ["", "", ...fixedLength(["NAVIGATION FAILED"], EXPECTED_VALUE_COUNT)];
    }

    await page.waitForSelector('[data-qa-id="legend"]', { timeout: 25000 });

    // ✅ DEBUG: print legend titles visible on this page
    const titlesOnPage = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const root = document.querySelector('[data-qa-id="legend"]');
      if (!root) return [];

      const nodes = Array.from(
        root.querySelectorAll('[data-qa-id="legend-source-title"]')
      );

      return nodes.map((n) => norm(n.innerText)).filter(Boolean);
    });

    console.log("[DEBUG] legend titles:", titlesOnPage);

    const now = new Date();
    const dateString = buildDate(now.getDate(), now.getMonth() + 1, now.getFullYear());

    const values = await page.evaluate((KEYWORDS) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

      const legend = document.querySelector('[data-qa-id="legend"]');
      if (!legend) return ["LEGEND NOT FOUND"];

      const titles = Array.from(
        legend.querySelectorAll('[data-qa-id="legend-source-title"]')
      );

      if (!titles.length) return ["NO LEGEND TITLES"];

      // find a title that matches any keyword
      const targetTitleEl = titles.find((t) => {
        const titleText = norm(t.innerText);
        return KEYWORDS.some((k) => titleText.includes(norm(k)));
      });

      if (!targetTitleEl) {
        // return what we saw so you can adjust keywords easily
        const seen = titles.map((t) => (t.innerText || "").trim()).filter(Boolean);
        return ["INDICATOR NOT FOUND", "SEEN:", ...seen.slice(0, 10)];
      }

      // find nearest section container
      const section =
        targetTitleEl.closest('[class*="item-"]') ||
        targetTitleEl.closest('[class*="legendItem-"]') ||
        targetTitleEl.parentElement;

      if (!section) return ["SECTION NOT FOUND"];

      // Values (partial class match)
      const valueSpans = section.querySelectorAll('[class*="valueValue-"]');

      const results = Array.from(valueSpans)
        .map((s) => (s.textContent || "").trim())
        .filter(Boolean)
        // remove tiny junk like "f", "ie"
        .filter((v) => v.length > 1);

      return results.length ? results : ["NO VALUES"];
    }, INDICATOR_KEYWORDS);

    console.log("[DEBUG] current page url:", page.url());
    console.log("[DEBUG] values:", values);

    console.log(`[Success] Scraped ${values.length} values from ${url}`);

    return ["", "", dateString, ...fixedLength(values, EXPECTED_VALUE_COUNT - 1)];
  } catch (err) {
    console.error(`[Fatal] Scrape Error on ${url}:`, err.message);
    return ["", "", ...fixedLength(["ERROR"], EXPECTED_VALUE_COUNT)];
  }
}
