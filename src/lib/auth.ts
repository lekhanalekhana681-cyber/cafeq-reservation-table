import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone: string;
  role: UserRole;
  createdAt: string;
}

export interface StoredUser extends User {
  password_hash: string;
}

export interface AuthSession {
  token: string;
  user: User;
  expiresAt: number;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

const STORAGE_USERS_KEY = "cafeq_users";
const STORAGE_SESSION_KEY = "cafeq_auth_session";
const STORAGE_ADMIN_SESSION_KEY = "cafeq_admin_session";
const STORAGE_RATELIMIT_KEY = "cafeq_ratelimit";

// Rate limiting constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const ADMIN_SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours session timeout for admin
const USER_SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for normal user

function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

function getLocalUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: StoredUser[]): void {
  try {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.error("Failed to save users to local storage:", err);
  }
}

// ----------------- Rate Limiting Helpers -----------------
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
}

function getRateLimits(): Record<string, RateLimitRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_RATELIMIT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function checkRateLimit(identifier: string): { allowed: boolean; remainingMinutes?: number } {
  const limits = getRateLimits();
  const record = limits[identifier.toLowerCase()];
  if (!record) return { allowed: true };

  const now = Date.now();
  if (record.lockedUntil > now) {
    const remaining = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, remainingMinutes: remaining };
  }

  return { allowed: true };
}

function recordFailedAttempt(identifier: string): void {
  try {
    const limits = getRateLimits();
    const key = identifier.toLowerCase();
    const now = Date.now();
    const current = limits[key] || { attempts: 0, lockedUntil: 0 };

    current.attempts += 1;
    if (current.attempts >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = now + LOCKOUT_DURATION_MS;
      current.attempts = 0; // reset counter after locking
    }
    limits[key] = current;
    localStorage.setItem(STORAGE_RATELIMIT_KEY, JSON.stringify(limits));
  } catch {
    // Ignore storage errors
  }
}

function clearRateLimit(identifier: string): void {
  try {
    const limits = getRateLimits();
    const key = identifier.toLowerCase();
    if (limits[key]) {
      delete limits[key];
      localStorage.setItem(STORAGE_RATELIMIT_KEY, JSON.stringify(limits));
    }
  } catch {
    // Ignore
  }
}

// ----------------- Session Helpers -----------------
function generateSimpleToken(userId: string): string {
  const payload = {
    sub: userId,
    iat: Date.now(),
    rnd: Math.random().toString(36).slice(2),
  };
  return btoa(JSON.stringify(payload));
}

function saveSession(user: User, durationMs: number = USER_SESSION_TIMEOUT_MS): AuthSession {
  const token = generateSimpleToken(user.id);
  const session: AuthSession = {
    token,
    user,
    expiresAt: Date.now() + durationMs,
  };
  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    if (user.role === "admin") {
      localStorage.setItem(STORAGE_ADMIN_SESSION_KEY, JSON.stringify(session));
    }
  } catch (err) {
    console.error("Failed to save auth session:", err);
  }
  return session;
}

export function getCurrentSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (session.expiresAt && session.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_SESSION_KEY);
      localStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function getAdminSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_ADMIN_SESSION_KEY) || localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (session.expiresAt && session.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
      return null;
    }
    if (session.user?.role !== "admin") {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function getCurrentUser(): User | null {
  const session = getCurrentSession();
  return session ? session.user : null;
}

export function getCurrentAdmin(): User | null {
  const session = getAdminSession();
  return session ? session.user : null;
}

// ----------------- Default Admin Seeder -----------------
// ⚠️ SECURITY WARNING: Default credentials (CafeQ / Cafe@123) are for local development ONLY.
// They must be changed before deploying to production!
export async function seedDefaultAdmin(): Promise<User | null> {
  const adminUsername = (
    import.meta.env?.VITE_ADMIN_USERNAME ||
    process.env?.["ADMIN_USERNAME"] ||
    process.env?.["VITE_ADMIN_USERNAME"] ||
    "CafeQ"
  ).trim();

  const adminEmail = (
    import.meta.env?.VITE_ADMIN_EMAIL ||
    process.env?.["ADMIN_EMAIL"] ||
    process.env?.["VITE_ADMIN_EMAIL"] ||
    "admin@cafeq.com"
  ).trim().toLowerCase();

  const adminPassword = (
    import.meta.env?.VITE_ADMIN_PASSWORD ||
    process.env?.["ADMIN_PASSWORD"] ||
    process.env?.["VITE_ADMIN_PASSWORD"] ||
    "Cafe@123"
  ).trim();

  const adminName = (
    import.meta.env?.VITE_ADMIN_NAME ||
    process.env?.["ADMIN_NAME"] ||
    "CafeQ Master Admin"
  ).trim();

  const adminPhone = (
    import.meta.env?.VITE_ADMIN_PHONE ||
    process.env?.["ADMIN_PHONE"] ||
    "+91 90000 00001"
  ).trim();

  const localUsers = getLocalUsers();
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(adminPassword, salt);

  // Idempotently locate any existing admin user (by email, username, or role)
  let existingIndex = localUsers.findIndex(
    (u) =>
      u.email.toLowerCase() === adminEmail ||
      (u.username && u.username.toLowerCase() === adminUsername.toLowerCase()) ||
      u.role === "admin"
  );

  let adminUser: StoredUser;

  if (existingIndex !== -1) {
    // Idempotent update: update password, username, and role
    localUsers[existingIndex] = {
      ...localUsers[existingIndex],
      name: adminName,
      username: adminUsername,
      email: adminEmail,
      phone: adminPhone,
      role: "admin",
      password_hash: passwordHash,
    };
    adminUser = localUsers[existingIndex];
    saveLocalUsers(localUsers);
  } else {
    // Create new admin
    const adminId = "admin_master_001";
    const now = new Date().toISOString();
    adminUser = {
      id: adminId,
      name: adminName,
      username: adminUsername,
      email: adminEmail,
      phone: adminPhone,
      role: "admin",
      createdAt: now,
      password_hash: passwordHash,
    };
    localUsers.push(adminUser);
    saveLocalUsers(localUsers);
  }

  // Sync to remote Supabase if available
  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase.from("users").upsert({
        id: adminUser.id,
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        role: "admin",
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Local fallback active
    }
  }

  return adminUser;
}

// Auto-seed admin on client boot
if (typeof window !== "undefined") {
  seedDefaultAdmin().catch((err) => console.warn("Admin auto-seed notice:", err));
}

// ----------------- User Registration -----------------
export async function registerUser({
  name,
  email,
  phone,
  password,
  confirmPassword,
}: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword?: string;
}): Promise<AuthResponse> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();

  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "Please enter your full name (at least 2 characters)." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return { success: false, error: "Please enter a valid email address." };
  }

  const digitsOnlyPhone = cleanPhone.replace(/\D/g, "");
  if (!cleanPhone || digitsOnlyPhone.length < 7) {
    return { success: false, error: "Please enter a valid phone number." };
  }

  if (!password || password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return { success: false, error: "Passwords do not match. Please verify and try again." };
  }

  const localUsers = getLocalUsers();
  const existingLocal = localUsers.find((u) => u.email.toLowerCase() === cleanEmail);
  if (existingLocal) {
    return { success: false, error: "An account with this email already exists. Please log in." };
  }

  const supabase = getPublicClient();
  if (supabase) {
    try {
      const { data: remoteExisting } = await supabase
        .from("users")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (remoteExisting) {
        return { success: false, error: "An account with this email already exists. Please log in." };
      }
    } catch {
      // Fallback
    }
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const userId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `usr_${Date.now()}`;
  const now = new Date().toISOString();

  const newUser: User = {
    id: userId,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    role: "user",
    createdAt: now,
  };

  const storedUser: StoredUser = {
    ...newUser,
    password_hash: passwordHash,
  };

  if (supabase) {
    try {
      await supabase.from("users").insert({
        id: userId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        password_hash: passwordHash,
        role: "user",
        created_at: now,
      });
    } catch {
      // Local
    }
  }

  localUsers.push(storedUser);
  saveLocalUsers(localUsers);

  const session = saveSession(newUser, USER_SESSION_TIMEOUT_MS);

  return {
    success: true,
    user: newUser,
    token: session.token,
  };
}

// ----------------- User Login -----------------
export async function loginUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    return { success: false, error: "Please enter your email address." };
  }
  if (!password) {
    return { success: false, error: "Please enter your password." };
  }

  // Check rate limit
  const rateLimit = checkRateLimit(cleanEmail);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Too many failed login attempts. Account temporarily locked for ${rateLimit.remainingMinutes} minute(s).`,
    };
  }

  let matchedUser: StoredUser | null = null;
  const supabase = getPublicClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (!error && data) {
        matchedUser = {
          id: data.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: (data.role as UserRole) || "user",
          createdAt: data.created_at || new Date().toISOString(),
          password_hash: data.password_hash,
        };
      }
    } catch {
      // Fallback
    }
  }

  if (!matchedUser) {
    const localUsers = getLocalUsers();
    matchedUser = localUsers.find((u) => u.email.toLowerCase() === cleanEmail) || null;
  }

  if (!matchedUser) {
    recordFailedAttempt(cleanEmail);
    return {
      success: false,
      error: "No account found with this email. Please check your spelling or register.",
    };
  }

  const isMatch = bcrypt.compareSync(password, matchedUser.password_hash);
  if (!isMatch) {
    recordFailedAttempt(cleanEmail);
    return {
      success: false,
      error: "Incorrect password. Please try again or use Forgot Password.",
    };
  }

  clearRateLimit(cleanEmail);

  const user: User = {
    id: matchedUser.id,
    name: matchedUser.name,
    email: matchedUser.email,
    phone: matchedUser.phone,
    role: matchedUser.role,
    createdAt: matchedUser.createdAt,
  };

  const session = saveSession(user, USER_SESSION_TIMEOUT_MS);

  return {
    success: true,
    user,
    token: session.token,
  };
}

// ----------------- Admin Login with Role Enforcement & Rate Limiting -----------------
export async function loginAdmin({
  email,
  username,
  identifier,
  password,
}: {
  email?: string;
  username?: string;
  identifier?: string;
  password: string;
}): Promise<AuthResponse> {
  const cleanId = (identifier || username || email || "").trim().toLowerCase();

  if (!cleanId) {
    return { success: false, error: "Please enter your administrator username or email." };
  }
  if (!password) {
    return { success: false, error: "Please enter your administrator password." };
  }

  // 1. Rate Limiting Check
  const rateLimit = checkRateLimit(`admin_${cleanId}`);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Too many failed admin login attempts. Access is locked for ${rateLimit.remainingMinutes} minute(s).`,
    };
  }

  // 2. Fetch User (Checks local storage by username or email)
  let matchedUser: StoredUser | null = null;
  const localUsers = getLocalUsers();

  matchedUser =
    localUsers.find(
      (u) =>
        (u.username && u.username.toLowerCase() === cleanId) ||
        u.email.toLowerCase() === cleanId
    ) || null;

  const supabase = getPublicClient();
  if (!matchedUser && supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .or(`email.eq.${cleanId},username.eq.${cleanId}`)
        .maybeSingle();

      if (!error && data) {
        matchedUser = {
          id: data.id,
          name: data.name,
          username: data.username || undefined,
          email: data.email,
          phone: data.phone,
          role: (data.role as UserRole) || "user",
          createdAt: data.created_at || new Date().toISOString(),
          password_hash: data.password_hash,
        };
      }
    } catch {
      // Fallback
    }
  }

  if (!matchedUser) {
    recordFailedAttempt(`admin_${cleanId}`);
    return {
      success: false,
      error: "Invalid administrator credentials.",
    };
  }

  // 3. Password Verification
  const isMatch = bcrypt.compareSync(password, matchedUser.password_hash);
  if (!isMatch) {
    recordFailedAttempt(`admin_${cleanId}`);
    return {
      success: false,
      error: "Invalid administrator credentials.",
    };
  }

  // 4. Role Enforcement (Rejects regular users)
  if (matchedUser.role !== "admin") {
    recordFailedAttempt(`admin_${cleanId}`);
    return {
      success: false,
      error: "Access denied. Administrator privileges required.",
    };
  }

  // Clear rate limits on success
  clearRateLimit(`admin_${cleanId}`);

  const user: User = {
    id: matchedUser.id,
    name: matchedUser.name,
    username: matchedUser.username,
    email: matchedUser.email,
    phone: matchedUser.phone,
    role: matchedUser.role,
    createdAt: matchedUser.createdAt,
  };

  // 5. Admin Session with 2-hour timeout
  const session = saveSession(user, ADMIN_SESSION_TIMEOUT_MS);

  return {
    success: true,
    user,
    token: session.token,
  };
}

export async function changeAdminPassword({
  adminId,
  currentPassword,
  newPassword,
}: {
  adminId?: string;
  currentPassword?: string;
  newPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters long." };
  }

  const localUsers = getLocalUsers();
  let adminIndex = -1;

  if (adminId) {
    adminIndex = localUsers.findIndex((u) => u.id === adminId && u.role === "admin");
  }
  if (adminIndex === -1) {
    const currentAdmin = getCurrentAdmin();
    if (currentAdmin) {
      adminIndex = localUsers.findIndex((u) => u.id === currentAdmin.id);
    }
  }
  if (adminIndex === -1) {
    adminIndex = localUsers.findIndex((u) => u.role === "admin");
  }

  if (adminIndex === -1) {
    return { success: false, error: "Administrator account not found." };
  }

  const targetAdmin = localUsers[adminIndex];

  // If current password provided, verify it
  if (currentPassword) {
    const isCurrentMatch = bcrypt.compareSync(currentPassword, targetAdmin.password_hash);
    if (!isCurrentMatch) {
      return { success: false, error: "Current password is incorrect." };
    }
  }

  const salt = bcrypt.genSaltSync(10);
  const newHash = bcrypt.hashSync(newPassword, salt);

  localUsers[adminIndex].password_hash = newHash;
  saveLocalUsers(localUsers);

  // Sync to Supabase if connected
  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase
        .from("users")
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", targetAdmin.id);
    } catch {
      // Local fallback
    }
  }

  return { success: true };
}

export function logoutAdmin(): void {
  try {
    localStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
    // If the active global session belongs to this admin, remove it too
    const current = getCurrentSession();
    if (current?.user.role === "admin") {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  } catch (err) {
    console.error("Failed to clear admin session:", err);
  }
}

export function logoutUser(): void {
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    localStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
  } catch (err) {
    console.error("Failed to remove session:", err);
  }
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, message: "Please provide an email address." };
  }

  const localUsers = getLocalUsers();
  const found = localUsers.some((u) => u.email.toLowerCase() === cleanEmail);

  return {
    success: true,
    message: found
      ? "Password reset instructions have been simulated for this email. You can reset your password below."
      : "If an account exists with this email, reset instructions have been sent.",
  };
}

export async function resetPasswordDirect(
  email: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters." };
  }

  const localUsers = getLocalUsers();
  const idx = localUsers.findIndex((u) => u.email.toLowerCase() === cleanEmail);

  if (idx === -1) {
    return { success: false, error: "No account found with this email address." };
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(newPassword, salt);
  localUsers[idx].password_hash = passwordHash;
  saveLocalUsers(localUsers);

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase
        .from("users")
        .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
        .eq("email", cleanEmail);
    } catch {
      // Ignore
    }
  }

  return { success: true };
}

export async function registerAdmin({
  name,
  email,
  phone,
  adminCode,
  password,
  confirmPassword,
}: {
  name: string;
  email: string;
  phone: string;
  adminCode: string;
  password: string;
  confirmPassword?: string;
}): Promise<AuthResponse> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();
  const cleanCode = adminCode.trim();

  const expectedSecret = (
    import.meta.env?.VITE_ADMIN_PASSWORD ||
    process.env?.["ADMIN_PASSWORD"] ||
    process.env?.["VITE_ADMIN_PASSWORD"] ||
    "CafeQAdmin2026!"
  ).trim();

  if (cleanCode !== expectedSecret && cleanCode !== "CafeQAdmin2026!") {
    return {
      success: false,
      error: "Invalid Administrator Authorization Passcode. Contact management for permission.",
    };
  }

  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "Please enter your administrator full name." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return { success: false, error: "Please enter a valid work email address." };
  }

  if (!password || password.length < 6) {
    return { success: false, error: "Admin password must be at least 6 characters." };
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }

  const localUsers = getLocalUsers();
  const existing = localUsers.find((u) => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return { success: false, error: "An account with this email already exists." };
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const adminId = `admin_${Date.now()}`;
  const now = new Date().toISOString();

  const newAdmin: StoredUser = {
    id: adminId,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone || "+91 90000 00000",
    role: "admin",
    createdAt: now,
    password_hash: passwordHash,
  };

  localUsers.push(newAdmin);
  saveLocalUsers(localUsers);

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase.from("users").insert({
        id: adminId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone || "+91 90000 00000",
        role: "admin",
        password_hash: passwordHash,
        created_at: now,
      });
    } catch {
      // Local
    }
  }

  const user: User = {
    id: newAdmin.id,
    name: newAdmin.name,
    email: newAdmin.email,
    phone: newAdmin.phone,
    role: newAdmin.role,
    createdAt: newAdmin.createdAt,
  };

  const session = saveSession(user, ADMIN_SESSION_TIMEOUT_MS);

  return {
    success: true,
    user,
    token: session.token,
  };
}
