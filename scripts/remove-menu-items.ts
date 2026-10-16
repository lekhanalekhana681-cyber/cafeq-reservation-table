import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// =============================================================================
// CafeQ Menu Cleanup Script (Idempotent)
// Completely removes:
// 1. Tandoori Chicken Momos
// 2. Garlic Bread with Cheese
// 3. Cheese Chilli Toast
// 4. White Sauce Pasta
// 5. Brown Butter Banana Bread (if exists)
// 6. Chicken Wings (6 pcs)
// =============================================================================

export interface TargetItemDef {
  key: string;
  name: string;
  slug: string;
  aliases: string[];
  imageFile: string;
}

export const TARGET_ITEMS: TargetItemDef[] = [
  {
    key: "tandoori-chicken-momos",
    name: "Tandoori Chicken Momos",
    slug: "tandoori-chicken-momos",
    aliases: ["tandoori chicken momos", "tandoori chicken momo", "tandoori momos chicken"],
    imageFile: "tandoori-chicken-momos.webp",
  },
  {
    key: "garlic-bread-with-cheese",
    name: "Garlic Bread with Cheese",
    slug: "garlic-bread-with-cheese",
    aliases: ["garlic bread with cheese", "cheese garlic bread", "garlic bread cheese", "garlic bread"],
    imageFile: "garlic-bread-with-cheese.webp",
  },
  {
    key: "cheese-chilli-toast",
    name: "Cheese Chilli Toast",
    slug: "cheese-chilli-toast",
    aliases: ["cheese chilli toast", "cheese chili toast", "chilli cheese toast", "chili cheese toast"],
    imageFile: "cheese-chilli-toast.webp",
  },
  {
    key: "white-sauce-pasta",
    name: "White Sauce Pasta",
    slug: "white-sauce-pasta",
    aliases: ["white sauce pasta", "pasta white sauce"],
    imageFile: "white-sauce-pasta.webp",
  },
  {
    key: "brown-butter-banana-bread",
    name: "Brown Butter Banana Bread",
    slug: "brown-butter-banana-bread",
    aliases: ["brown butter banana bread", "banana bread", "brown butter banana"],
    imageFile: "brown-butter-banana-bread.webp",
  },
  {
    key: "chicken-wings-6-pcs",
    name: "Chicken Wings (6 pcs)",
    slug: "chicken-wings-6-pcs",
    aliases: ["chicken wings (6 pcs)", "chicken wings", "chicken wings 6 pcs", "chicken wings (6pcs)"],
    imageFile: "chicken-wings-6-pcs.webp",
  },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchesTarget(testName: string, target: TargetItemDef): boolean {
  const testNorm = normalize(testName);
  for (const alias of target.aliases) {
    if (testNorm === normalize(alias)) return true;
  }
  // Check exact normalized equality with main name
  if (testNorm === normalize(target.name)) return true;
  // Check if string contains target name without non-alphanumerics
  if (testNorm.length > 5 && (normalize(target.name).includes(testNorm) || testNorm.includes(normalize(target.name)))) {
    return true;
  }
  return false;
}

export function findMatchingTarget(testName: string): TargetItemDef | null {
  for (const target of TARGET_ITEMS) {
    if (matchesTarget(testName, target)) return target;
  }
  return null;
}

// Load .env manually if present
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || "";
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!process.env[key]) {
          process.env[key] = val.trim();
        }
      }
    }
  }
}

async function main() {
  loadEnv();

  console.log("=================================================================");
  console.log("  CafeQ Menu Items Cleanup: Idempotent Removal & Pruning Script");
  console.log("=================================================================\n");

  const seedScriptPath = path.resolve(process.cwd(), "scripts", "seed-menu.ts");
  const menuTsPath = path.resolve(process.cwd(), "src", "data", "menu.ts");
  const menuJsonPath = path.resolve(process.cwd(), "public", "menu.json");
  const seedSqlPath = path.resolve(process.cwd(), "supabase", "seed_menu.sql");
  const rootUploadsDir = path.resolve(process.cwd(), "uploads", "menu");
  const publicUploadsDir = path.resolve(process.cwd(), "public", "uploads", "menu");
  const migrationDir = path.resolve(process.cwd(), "supabase", "migrations");

  // ---------------------------------------------------------------------------
  // STEP 1: SCAN & MATCH (BEFORE DELETING, LIST MATCHING RECORDS)
  // ---------------------------------------------------------------------------
  console.log("🔍 STEP 1: Scanning codebase and records for items to remove...\n");

  interface MatchRecord {
    target: TargetItemDef;
    matchedIn: {
      seedScript: boolean;
      menuTs: boolean;
      menuJson: boolean;
      seedSql: boolean;
      rootImage: boolean;
      publicImage: boolean;
    };
    details?: {
      category?: string;
      price?: number;
      description?: string;
    };
  }

  const matchResults: MatchRecord[] = [];

  // Read current files
  const seedScriptContent = fs.existsSync(seedScriptPath) ? fs.readFileSync(seedScriptPath, "utf-8") : "";
  const menuTsContent = fs.existsSync(menuTsPath) ? fs.readFileSync(menuTsPath, "utf-8") : "";
  const menuJsonItems: any[] = fs.existsSync(menuJsonPath)
    ? JSON.parse(fs.readFileSync(menuJsonPath, "utf-8"))
    : [];
  const seedSqlContent = fs.existsSync(seedSqlPath) ? fs.readFileSync(seedSqlPath, "utf-8") : "";

  for (const target of TARGET_ITEMS) {
    const inSeedScript = seedScriptContent.toLowerCase().includes(target.name.toLowerCase()) ||
      target.aliases.some((a) => seedScriptContent.toLowerCase().includes(a.toLowerCase()));

    const inMenuTs = menuTsContent.toLowerCase().includes(target.name.toLowerCase()) ||
      menuTsContent.includes(`"${target.slug}"`);

    const jsonMatch = menuJsonItems.find(
      (it) => it.id === target.slug || matchesTarget(it.name, target)
    );

    const inSeedSql = seedSqlContent.toLowerCase().includes(target.name.toLowerCase()) ||
      target.aliases.some((a) => seedSqlContent.toLowerCase().includes(a.toLowerCase()));

    const rootImgPath = path.resolve(rootUploadsDir, target.imageFile);
    const pubImgPath = path.resolve(publicUploadsDir, target.imageFile);

    const inRootImg = fs.existsSync(rootImgPath);
    const inPubImg = fs.existsSync(pubImgPath);

    const isMatched = inSeedScript || inMenuTs || !!jsonMatch || inSeedSql || inRootImg || inPubImg;

    if (isMatched) {
      matchResults.push({
        target,
        matchedIn: {
          seedScript: inSeedScript,
          menuTs: inMenuTs,
          menuJson: !!jsonMatch,
          seedSql: inSeedSql,
          rootImage: inRootImg,
          publicImage: inPubImg,
        },
        details: jsonMatch
          ? {
              category: jsonMatch.category,
              price: jsonMatch.price,
              description: jsonMatch.description,
            }
          : undefined,
      });
    } else {
      console.log(`ℹ️ [REPORT] Target item "${target.name}" not found in current records (already removed or nonexistent).`);
    }
  }

  console.log("\n📋 MATCHING RECORDS IDENTIFIED FOR REMOVAL (CONFIRMATION LIST):");
  console.log("-----------------------------------------------------------------");
  if (matchResults.length === 0) {
    console.log("✨ No matching records found. The menu is already clean and contains none of these items.");
  } else {
    matchResults.forEach((rec, idx) => {
      console.log(`\n${idx + 1}. Item: "${rec.target.name}" (Slug: ${rec.target.slug})`);
      if (rec.details) {
        console.log(`   - Category:    ${rec.details.category || "N/A"}`);
        console.log(`   - Price:       ₹${rec.details.price ?? "N/A"}`);
        console.log(`   - Description: ${rec.details.description || "N/A"}`);
      }
      console.log(`   - Locations to remove:`);
      console.log(`     * Seed script (scripts/seed-menu.ts):    ${rec.matchedIn.seedScript ? "FOUND" : "not present"}`);
      console.log(`     * TS menu data (src/data/menu.ts):       ${rec.matchedIn.menuTs ? "FOUND" : "not present"}`);
      console.log(`     * Client JSON (public/menu.json):        ${rec.matchedIn.menuJson ? "FOUND" : "not present"}`);
      console.log(`     * SQL Seed (supabase/seed_menu.sql):     ${rec.matchedIn.seedSql ? "FOUND" : "not present"}`);
      console.log(`     * Root image (uploads/menu/${rec.target.imageFile}):        ${rec.matchedIn.rootImage ? "EXISTS" : "not present"}`);
      console.log(`     * Public image (public/uploads/menu/${rec.target.imageFile}): ${rec.matchedIn.publicImage ? "EXISTS" : "not present"}`);
    });
  }
  console.log("\n-----------------------------------------------------------------\n");

  // ---------------------------------------------------------------------------
  // STEP 2: REMOVE FROM SEED SCRIPT (scripts/seed-menu.ts)
  // ---------------------------------------------------------------------------
  console.log("🗑️  STEP 2: Removing items from scripts/seed-menu.ts...");
  if (fs.existsSync(seedScriptPath)) {
    let scriptContent = fs.readFileSync(seedScriptPath, "utf-8");

    // Remove each item block cleanly
    // Item blocks follow the pattern:
    //   {\n    name: "...",\n    category: "...", ...\n  },
    const itemRegex = /\{\s*name:\s*["']([^"']+)["'][\s\S]*?\},?\n?/g;
    let removedFromScriptCount = 0;

    scriptContent = scriptContent.replace(itemRegex, (fullMatch, itemName) => {
      const match = findMatchingTarget(itemName);
      if (match) {
        removedFromScriptCount++;
        console.log(`   ✓ Removed "${itemName}" from MENU_DATA in scripts/seed-menu.ts`);
        return "";
      }
      return fullMatch;
    });

    fs.writeFileSync(seedScriptPath, scriptContent, "utf-8");
    console.log(`   Total items pruned from seed-menu.ts: ${removedFromScriptCount}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 3: REMOVE IMAGE FILES FROM uploads/menu/ AND public/uploads/menu/
  // ---------------------------------------------------------------------------
  console.log("\n🖼️  STEP 3: Deleting image files from /uploads/menu/ and /public/uploads/menu/...");
  for (const target of TARGET_ITEMS) {
    const rootPath = path.resolve(rootUploadsDir, target.imageFile);
    const pubPath = path.resolve(publicUploadsDir, target.imageFile);

    if (fs.existsSync(rootPath)) {
      try {
        fs.unlinkSync(rootPath);
        console.log(`   ✓ Deleted ${rootPath}`);
      } catch (err) {
        console.warn(`   ! Warning: Failed to delete ${rootPath}:`, err);
      }
    } else {
      console.log(`   ℹ️ Already deleted: ${rootPath}`);
    }

    if (fs.existsSync(pubPath)) {
      try {
        fs.unlinkSync(pubPath);
        console.log(`   ✓ Deleted ${pubPath}`);
      } catch (err) {
        console.warn(`   ! Warning: Failed to delete ${pubPath}:`, err);
      }
    } else {
      console.log(`   ℹ️ Already deleted: ${pubPath}`);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 4: REGENERATE DERIVED SEED FILES VIA SEED SCRIPT
  // ---------------------------------------------------------------------------
  console.log("\n🌱 STEP 4: Regenerating src/data/menu.ts, public/menu.json, and supabase/seed_menu.sql...");
  // We can directly filter the data or invoke seed-menu
  // Let's filter public/menu.json
  if (fs.existsSync(menuJsonPath)) {
    const currentJson: any[] = JSON.parse(fs.readFileSync(menuJsonPath, "utf-8"));
    const filteredJson = currentJson.filter((it) => !findMatchingTarget(it.name) && !TARGET_ITEMS.some((t) => t.slug === it.id));
    fs.writeFileSync(menuJsonPath, JSON.stringify(filteredJson, null, 2), "utf-8");
    console.log(`   ✓ Updated public/menu.json (remaining items: ${filteredJson.length})`);
  }

  // Filter src/data/menu.ts
  if (fs.existsSync(menuTsPath)) {
    let tsContent = fs.readFileSync(menuTsPath, "utf-8");
    const jsonMatch = tsContent.match(/export const menu: MenuItem\[\] = (\[[\s\S]*?\]);/);
    if (jsonMatch) {
      try {
        const rawMenuItems: any[] = JSON.parse(jsonMatch[1]);
        const cleanedMenuItems = rawMenuItems.filter(
          (it) => !findMatchingTarget(it.name) && !TARGET_ITEMS.some((t) => t.slug === it.id)
        );
        tsContent = tsContent.replace(
          jsonMatch[0],
          `export const menu: MenuItem[] = ${JSON.stringify(cleanedMenuItems, null, 2)};`
        );
        fs.writeFileSync(menuTsPath, tsContent, "utf-8");
        console.log(`   ✓ Updated src/data/menu.ts (remaining items: ${cleanedMenuItems.length})`);
      } catch (err) {
        console.warn("   ! Note on parsing menu.ts JSON array:", err);
      }
    }
  }

  // Filter supabase/seed_menu.sql
  if (fs.existsSync(seedSqlPath)) {
    let sqlContent = fs.readFileSync(seedSqlPath, "utf-8");
    for (const target of TARGET_ITEMS) {
      // Remove INSERT statement block for this target
      const escName = target.name.replace(/'/g, "''");
      const insertRegex = new RegExp(
        `INSERT INTO menu_items \\(name[\\s\\S]*?VALUES \\('${escName}'[\\s\\S]*?updated_at = NOW\\(\\);\\n*`,
        "gi"
      );
      sqlContent = sqlContent.replace(insertRegex, "");
      for (const alias of target.aliases) {
        const escAlias = alias.replace(/'/g, "''");
        const aliasRegex = new RegExp(
          `INSERT INTO menu_items \\(name[\\s\\S]*?VALUES \\('${escAlias}'[\\s\\S]*?updated_at = NOW\\(\\);\\n*`,
          "gi"
        );
        sqlContent = sqlContent.replace(aliasRegex, "");
      }
    }
    fs.writeFileSync(seedSqlPath, sqlContent, "utf-8");
    console.log(`   ✓ Cleaned supabase/seed_menu.sql (discontinued items removed)`);
  }

  // ---------------------------------------------------------------------------
  // STEP 5: SUPABASE DATABASE REMOVAL & MIGRATION FILE
  // ---------------------------------------------------------------------------
  console.log("\n🗄️  STEP 5: Supabase Database cleanup...");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      console.log(`   Connecting to Supabase at: ${supabaseUrl}`);
      const supabase = createClient(supabaseUrl, supabaseKey);
      const targetNames = TARGET_ITEMS.map((t) => t.name);

      // Also clean up foreign keys in booking_items if present
      const { data: matchedDbItems, error: selectErr } = await supabase
        .from("menu_items")
        .select("id, name")
        .or(targetNames.map((n) => `name.ilike.%${n}%`).join(","));

      if (matchedDbItems && matchedDbItems.length > 0) {
        console.log(`   Found ${matchedDbItems.length} records in Supabase menu_items table.`);
        const ids = matchedDbItems.map((m) => m.id);

        // Delete from booking_items references if table exists
        await supabase.from("booking_items").delete().in("menu_item_id", ids);

        // Delete from menu_items
        const { error: delErr } = await supabase.from("menu_items").delete().in("id", ids);
        if (delErr) {
          console.warn("   ! Error deleting from Supabase menu_items:", delErr.message);
        } else {
          console.log(`   ✓ Successfully deleted ${ids.length} records from Supabase menu_items.`);
        }
      } else {
        console.log("   ℹ️ No matching records in Supabase database (or table is already clean).");
      }
    } catch (err: any) {
      console.warn("   ! Supabase live connection notice:", err.message);
    }
  } else {
    console.log("   ℹ️ Supabase environment variables not set; live DB skipped.");
  }

  // Ensure idempotent migration SQL file is present in supabase/migrations
  if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
  }
  const migrationPath = path.resolve(migrationDir, "20261016000000_remove_discontinued_menu_items.sql");
  const migrationSql = `-- Migration: Remove discontinued menu items
-- 1. Tandoori Chicken Momos
-- 2. Garlic Bread with Cheese
-- 3. Cheese Chilli Toast
-- 4. White Sauce Pasta
-- 5. Brown Butter Banana Bread
-- 6. Chicken Wings (6 pcs)

DO $$
BEGIN
  -- 1. Safely remove foreign key references in booking_items if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_items') THEN
    DELETE FROM public.booking_items
    WHERE menu_item_id IN (
      SELECT id FROM public.menu_items
      WHERE LOWER(name) IN (
        'tandoori chicken momos',
        'garlic bread with cheese',
        'cheese chilli toast',
        'white sauce pasta',
        'brown butter banana bread',
        'chicken wings (6 pcs)',
        'chicken wings'
      )
    );
  END IF;

  -- 2. Delete discontinued items from menu_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'menu_items') THEN
    DELETE FROM public.menu_items
    WHERE LOWER(name) IN (
      'tandoori chicken momos',
      'garlic bread with cheese',
      'cheese chilli toast',
      'white sauce pasta',
      'brown butter banana bread',
      'chicken wings (6 pcs)',
      'chicken wings'
    );
  END IF;
END $$;
`;
  fs.writeFileSync(migrationPath, migrationSql, "utf-8");
  console.log(`   ✓ Verified migration file: supabase/migrations/20261016000000_remove_discontinued_menu_items.sql`);

  // ---------------------------------------------------------------------------
  // STEP 6: VERIFY FINAL MENU (NO TARGET ITEMS REMAIN)
  // ---------------------------------------------------------------------------
  console.log("\n✅ STEP 6: Verifying final menu state across all files...\n");

  const finalSeedScript = fs.readFileSync(seedScriptPath, "utf-8");
  const finalMenuTs = fs.readFileSync(menuTsPath, "utf-8");
  const finalMenuJson = fs.readFileSync(menuJsonPath, "utf-8");
  const finalSeedSql = fs.readFileSync(seedSqlPath, "utf-8");

  let verificationFailed = false;

  for (const target of TARGET_ITEMS) {
    const inScript = finalSeedScript.toLowerCase().includes(target.name.toLowerCase());
    const inTs = finalMenuTs.toLowerCase().includes(target.name.toLowerCase()) || finalMenuTs.includes(`"${target.slug}"`);
    const inJson = finalMenuJson.toLowerCase().includes(`"${target.name.toLowerCase()}"`) || finalMenuJson.includes(`"${target.slug}"`);
    const inSql = finalSeedSql.toLowerCase().includes(`'${target.name.toLowerCase()}'`);
    const rootImg = fs.existsSync(path.resolve(rootUploadsDir, target.imageFile));
    const pubImg = fs.existsSync(path.resolve(publicUploadsDir, target.imageFile));

    if (inScript || inTs || inJson || inSql || rootImg || pubImg) {
      console.error(`❌ VERIFICATION FAILURE: "${target.name}" still detected!`);
      if (inScript) console.error(`   - Present in seed-menu.ts`);
      if (inTs) console.error(`   - Present in src/data/menu.ts`);
      if (inJson) console.error(`   - Present in public/menu.json`);
      if (inSql) console.error(`   - Present in supabase/seed_menu.sql`);
      if (rootImg) console.error(`   - Present in uploads/menu/${target.imageFile}`);
      if (pubImg) console.error(`   - Present in public/uploads/menu/${target.imageFile}`);
      verificationFailed = true;
    } else {
      console.log(`✓ Confirmed removed: "${target.name}" (Slug: ${target.slug})`);
    }
  }

  if (verificationFailed) {
    console.error("\n❌ Cleanup verification encountered errors.");
    process.exit(1);
  } else {
    console.log("\n🎉 ALL 6 ITEMS COMPLETELY AND SAFELY REMOVED!");
    console.log("=================================================================");
  }
}

main().catch((err) => {
  console.error("Fatal error during cleanup:", err);
  process.exit(1);
});
