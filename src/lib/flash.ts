/**
 * Helpers for URL-based flash messages.
 * Server actions call flashRedirect() to bounce back to the page with a success or error banner.
 */
import { redirect } from "next/navigation";

export function flashOk(path: string, msg: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}_ok=${encodeURIComponent(msg)}`);
}

export function flashErr(path: string, msg: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}_err=${encodeURIComponent(msg)}`);
}
