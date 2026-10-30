/**
 * Automated Test Suite for the Login and User Registration form test cases
 *
 * Testing Module: Login Page
 *   1. Username  -BLANK-  → "Please fill out this field"      (required)
 *   2. Username  admin    → accepted
 *   3. Password  -BLANK-  → "Please fill out this field"      (required)
 *   4. Password  admin    → accepted
 * Testing Module: User Registration Page
 *   1. E-mail    mgmail.com            → "Please match the requested format."
 *   2. E-mail    m@gmail.com           → accepted
 *   3. Password  7 chars, lowercase    → "Please match the requested format."
 *   4. Password  8 chars, uppercase    → accepted
 *   5. Phone     8 chars, with letters → "Please match the requested format."
 *   6. Phone     10 digits             → accepted
 *
 * The browser shows those messages itself for `required` / `pattern` fields, so this suite
 * checks (a) the page markup, (b) each input against the pattern exactly as the browser
 * compiles it (anchored, `v` flag), and (c) the same rule in registerUser.
 */
import fs from "node:fs";
import path from "node:path";

// Mock localStorage for node environment
const mockStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k];
  },
  key: (i: number) => Object.keys(mockStorage)[i] || null,
  length: Object.keys(mockStorage).length,
};
(global as any).window = { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
(global as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params: any = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    testsFailed++;
  }
}

/** Mimics the browser: an <input pattern> must match the WHOLE value, compiled with the `v` flag. */
const browserAccepts = (pattern: string, value: string) => new RegExp(`^(?:${pattern})$`, "v").test(value);

/** The JSX of one <Input id="…" …/> element from a page file. */
function inputMarkup(file: string, id: string): string {
  const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const start = src.indexOf(`id="${id}"`);
  if (start < 0) return "";
  return src.slice(src.lastIndexOf("<Input", start), src.indexOf("/>", start));
}

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running CafeQ Login & Registration Form Test Cases");
  console.log("==================================================\n");

  const { REGISTRATION_PATTERNS, registerUser } = await import("../src/lib/auth");

  // --------------------------------------------------------------------------
  console.log("Testing Module: Login Page");

  for (const [file, label] of [
    ["src/routes/admin/login.tsx", "Admin login"],
    ["src/routes/login.tsx", "User login"],
  ] as const) {
    const userField = inputMarkup(file, file.includes("admin") ? "admin-identifier" : "email");
    const passField = inputMarkup(file, file.includes("admin") ? "admin-password" : "password");
    assert(/\brequired\b/.test(userField), `${label} 1. Username -BLANK- → required → "Please fill out this field"`);
    assert(/\brequired\b/.test(passField), `${label} 3. Password -BLANK- → required → "Please fill out this field"`);
  }
  const adminUser = inputMarkup("src/routes/admin/login.tsx", "admin-identifier");
  const adminPass = inputMarkup("src/routes/admin/login.tsx", "admin-password");
  assert(/type="text"/.test(adminUser) && !/pattern=/.test(adminUser), `2. Username "admin" → accepted (plain text field)`);
  assert(!/pattern=|minLength/.test(adminPass), `4. Password "admin" → accepted (no format rule on login)`);

  // --------------------------------------------------------------------------
  console.log("\nTesting Module: User Registration Page");

  const emailField = inputMarkup("src/routes/register.tsx", "email");
  const passwordField = inputMarkup("src/routes/register.tsx", "password");
  const phoneField = inputMarkup("src/routes/register.tsx", "phone");
  assert(
    /type="text"/.test(emailField) && /pattern=\{REGISTRATION_PATTERNS\.email\}/.test(emailField) && /\brequired\b/.test(emailField),
    "E-mail field uses a format pattern (browser message: \"Please match the requested format.\")"
  );
  assert(/pattern=\{REGISTRATION_PATTERNS\.password\}/.test(passwordField), "Password field uses the 8+ chars / uppercase pattern");
  assert(/pattern=\{REGISTRATION_PATTERNS\.phone\}/.test(phoneField) && /maxLength=\{10\}/.test(phoneField), "Phone field uses the 10-digit pattern");

  const cases: Array<{ no: number; field: "email" | "password" | "phone"; input: string; accept: boolean; label: string }> = [
    { no: 1, field: "email", input: "mgmail.com", accept: false, label: 'E-mail "mgmail.com"' },
    { no: 2, field: "email", input: "m@gmail.com", accept: true, label: 'E-mail "m@gmail.com"' },
    { no: 3, field: "password", input: "abcdefg", accept: false, label: "Password 7 chars, lowercase" },
    { no: 4, field: "password", input: "ABCDEFGH", accept: true, label: "Password 8 chars, uppercase" },
    { no: 5, field: "phone", input: "1234abcd", accept: false, label: "Phone 8 chars, with alphabets" },
    { no: 6, field: "phone", input: "9876543210", accept: true, label: "Phone 10 digits" },
  ];

  const valid = { name: "Test User", email: "test.user@gmail.com", phone: "9000000001", password: "Password1" };
  let seq = 0;
  for (const c of cases) {
    const browser = browserAccepts(REGISTRATION_PATTERNS[c.field], c.input);
    assert(
      browser === c.accept,
      `${c.no}. ${c.label} → ${c.accept ? `accepted (${c.input})` : '"Please match the requested format."'} [browser pattern]`
    );

    const data = { ...valid, email: `user${++seq}@gmail.com`, [c.field]: c.input };
    const res = await registerUser({ ...data, confirmPassword: data.password });
    assert(res.success === c.accept, `${c.no}. ${c.label} → ${c.accept ? "account created" : `rejected: "${res.error}"`} [registerUser]`);
  }

  // Extra edge cases for the same rules
  assert(!browserAccepts(REGISTRATION_PATTERNS.password, "abcdefgh"), "Password 8 chars but no uppercase → rejected");
  assert(!browserAccepts(REGISTRATION_PATTERNS.password, "ABCDEFG"), "Password 7 chars uppercase → rejected");
  assert(!browserAccepts(REGISTRATION_PATTERNS.phone, "98765432101"), "Phone 11 digits → rejected");
  assert(!browserAccepts(REGISTRATION_PATTERNS.phone, "+91 9876543"), "Phone with +91 and spaces → rejected");
  assert(!browserAccepts(REGISTRATION_PATTERNS.email, "m@gmail"), 'E-mail without a domain ending ("m@gmail") → rejected');

  console.log("\n==================================================");
  console.log(`  Tests Completed: ${testsPassed + testsFailed}`);
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log("==================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
