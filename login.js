// login.js
import dotenv from "dotenv";
dotenv.config();

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function login(page) {
  console.log("Navigating to TradingView Login...");

  await page.setUserAgent(UA);

  await page.goto("https://www.tradingview.com/accounts/signin/", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await delay(4000);

  // if already logged in
  const isLoggedIn = await page.evaluate(() => {
    return (
      !window.location.href.includes("/signin") &&
      !window.location.href.includes("/login")
    );
  });

  if (isLoggedIn) {
    console.log("Already logged in!");
    return await page.cookies();
  }

  // Click Email button if present
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const emailBtn = btns.find((b) =>
      (b.textContent || "").toLowerCase().includes("email")
    );
    if (emailBtn) emailBtn.click();
  });

  await delay(2000);

  // Fill username/email
  const usernameSelectors = [
    'input[name="id_username"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="email" i]',
    'input[id*="username"]',
    'input[id*="email"]',
  ];

  let userSel = null;
  for (const sel of usernameSelectors) {
    const el = await page.$(sel);
    if (el) {
      userSel = sel;
      break;
    }
  }
  if (!userSel) throw new Error("Could not find username/email input");

  await page.click(userSel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(userSel, EMAIL, { delay: 80 });

  await delay(800);

  // Fill password
  const passwordSelectors = [
    'input[name="id_password"]',
    'input[name="password"]',
    'input[type="password"]',
    'input[id*="password"]',
    'input[placeholder*="password" i]',
  ];

  let passSel = null;
  for (const sel of passwordSelectors) {
    const el = await page.$(sel);
    if (el) {
      passSel = sel;
      break;
    }
  }
  if (!passSel) throw new Error("Could not find password input");

  await page.click(passSel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(passSel, PASSWORD, { delay: 80 });

  await delay(800);

  // Submit
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const submit =
      btns.find((b) =>
        (b.textContent || "").toLowerCase().includes("sign in")
      ) ||
      btns.find((b) =>
        (b.textContent || "").toLowerCase().includes("login")
      ) ||
      btns.find((b) =>
        (b.textContent || "").toLowerCase().includes("continue")
      );
    if (submit) submit.click();
  });

  console.log("Waiting for login to complete...");

  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
      page.waitForFunction(
        () =>
          !window.location.href.includes("/signin") &&
          !window.location.href.includes("/login"),
        { timeout: 30000 }
      ),
    ]);
  } catch (e) {
    console.warn("Login wait timed out, checking URL...");
  }

  const finalUrl = page.url();
  console.log("Final URL:", finalUrl);

  if (finalUrl.includes("/signin") || finalUrl.includes("/login")) {
    await page.screenshot({ path: "login_failed_debug.png", fullPage: true });
    throw new Error("Login failed: Still on login page (see login_failed_debug.png)");
  }

  console.log("Login successful! Saving cookies...");
  return await page.cookies();
}
