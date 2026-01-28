import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strip HTML tags from a string and clean up whitespace.
 * Useful for displaying content that may contain HTML.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    // Remove script and style elements entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    // Replace block-level elements with spaces
    .replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, " ")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Clean up whitespace
    .replace(/\s+/g, " ")
    .trim();
}
