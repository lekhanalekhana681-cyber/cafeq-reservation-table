import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
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

function generateSimpleToken(userId: string): string {
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    rnd: Math.random().toString(36).slice(2),
  };
  return btoa(JSON.stringify(payload));
}

function saveSession(user: User): AuthSession {
  const token = generateSimpleToken(user.id);
  const session: AuthSession = {
    token,
    user,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
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

  // 1. Validation checks
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

  // 2. Check if email already exists
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
      // Fallback to local check if remote table query encounters error
    }
  }

  // 3. Hash password using bcrypt
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

  // 4. Persist to database (if available)
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
    } catch (err) {
      console.warn("Could not insert user into remote Supabase database, storing locally:", err);
    }
  }

  // Always save locally for instant offline and fast reads
  localUsers.push(storedUser);
  saveLocalUsers(localUsers);

  // 5. Establish session
  const session = saveSession(newUser);

  return {
    success: true,
    user: newUser,
    token: session.token,
  };
}

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

  let matchedUser: StoredUser | null = null;

  // Check remote DB first if Supabase is available
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
      // Fallback to local
    }
  }

  // Fallback to local users
  if (!matchedUser) {
    const localUsers = getLocalUsers();
    matchedUser = localUsers.find((u) => u.email.toLowerCase() === cleanEmail) || null;
  }

  if (!matchedUser) {
    return {
      success: false,
      error: "No account found with this email. Please check your spelling or register.",
    };
  }

  // Verify password with bcrypt
  const isMatch = bcrypt.compareSync(password, matchedUser.password_hash);
  if (!isMatch) {
    return {
      success: false,
      error: "Incorrect password. Please try again or use Forgot Password.",
    };
  }

  const user: User = {
    id: matchedUser.id,
    name: matchedUser.name,
    email: matchedUser.email,
    phone: matchedUser.phone,
    role: matchedUser.role,
    createdAt: matchedUser.createdAt,
  };

  const session = saveSession(user);

  return {
    success: true,
    user,
    token: session.token,
  };
}

export function logoutUser(): void {
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
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

  // Even if not found, we return a safe message or confirmation for security
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
