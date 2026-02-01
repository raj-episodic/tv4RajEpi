// scraper.js
// ✅ Updated: robust legend scraping (no hashed classes), removes junk like "fie fie"

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function safeGoto(page, url, retries = 3) {
  await page.setUserAgent(UA);

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[Navigation] Attempt ${i + 1}: ${url}`);

      await page.goto(url, { waitUntil: "load", timeout: 60000 });

      // kill blockers early
      await killPopups(page);

      // wait canvas render (chart engine)
      await page.waitForFunction(() => {
        const canvas = document.querySelector("canvas");
        return canvas && canvas.offsetWidth > 0;
      }, { timeout: 25000 });

      // buffer for indicators calc
      await delay(4000);

      // kill delayed popups
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
  } catch (e) {
    // ignore
  }
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

    // wait legend
    await page.waitForSelector('[data-qa-id="legend"]', { timeout: 20000 });

    const now = new Date();
    const dateString = buildDate(now.getDate(), now.getMonth() + 1, now.getFullYear());

    const values = await page.$$eval('[data-qa-id="legend"]', (legends) => {
      const legend = legends[0];
      if (!legend) return ["LEGEND NOT FOUND"];

      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

      // Titles (indicator name area)
      const titles = Array.from(
        legend.querySelectorAll('[data-qa-id="legend-source-title"]')
      );

      // find indicator whose title includes "clubbed"
      const targetTitleEl = titles.find((t) => norm(t.innerText).includes("clubbed"));

      if (!targetTitleEl) return ["INDICATOR NOT FOUND"];

      // find closest section block that contains both title + values
      const section =
        targetTitleEl.closest('[class*="item-"]') ||
        targetTitleEl.closest('[class*="legendItem-"]') ||
        targetTitleEl.parentElement;

      if (!section) return ["SECTION NOT FOUND"];

      // values: partial class match survives hash changes
      const valueSpans = section.querySelectorAll('[class*="valueValue-"]');

      const results = Array.from(valueSpans)
        .map((s) => (s.textContent || "").trim())
        .filter(Boolean)
        // remove junk single letters or tiny fragments like "f", "ie"
        .filter((v) => v.length > 1);

      return results.length ? results : ["NO VALUES"];
    });

    console.log("[DEBUG] current page url:", page.url());
    console.log("[DEBUG] values:", values);

    console.log(`[Success] Scraped ${values.length} values from ${url}`);

    // output format: ["", "", date, ...values] with fixed length
    return ["", "", dateString, ...fixedLength(values, EXPECTED_VALUE_COUNT - 1)];
  } catch (err) {
    console.error(`[Fatal] Scrape Error on ${url}:`, err.message);
    return ["", "", ...fixedLength(["ERROR"], EXPECTED_VALUE_COUNT)];
  }
}
