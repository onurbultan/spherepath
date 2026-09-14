import { matchSegmentContact, type ContactNameCandidate } from "./note-segments.js";

/**
 * Tagging somebody in the day's page, the way you tag somebody in a comment.
 * The mention is stored as what the advisor typed -- plain text -- and resolved
 * to a contact when the page is read. Nothing in the pipeline has to learn a
 * markup format, a note copied out of the app is still the note, and a name
 * that matches nobody is simply a name they wrote.
 *
 * Turkish names carry ı, İ, ğ, ş, ö, ç, ü, and a mention runs until the word
 * that clearly is not part of a name: a lowercase verb, punctuation, or the
 * end of the line.
 */

/** Up to three capitalised words after an @, which is a Turkish full name plus a title. */
const mentionPattern = /@(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*){0,2})/gu;

export interface NoteMention {
  /** What the advisor typed after the @, without the @. */
  name: string;
  /** Where it sits in the text, so an editor can highlight it. */
  start: number;
  end: number;
}

export function extractMentions(text: string): NoteMention[] {
  const mentions: NoteMention[] = [];
  for (const match of text.matchAll(mentionPattern)) {
    if (match.index === undefined) continue;
    const name = match[1]?.trim();
    if (!name || name.length < 2) continue;
    mentions.push({ name, start: match.index, end: match.index + match[0].length });
  }
  return mentions;
}

export interface ResolvedMention extends NoteMention {
  contactId: string | null;
  contactName: string | null;
}

/**
 * Matches every mention against the advisor's own contacts. An unmatched
 * mention is kept rather than dropped: the advisor still meant somebody, and
 * the review can offer to create them.
 */
export function resolveMentions(text: string, contacts: readonly ContactNameCandidate[]): ResolvedMention[] {
  return extractMentions(text).map((mention) => {
    const matched = matchSegmentContact(mention.name, contacts);
    return { ...mention, contactId: matched?.id ?? null, contactName: matched?.name ?? null };
  });
}

/** The contacts a line tags, in the order they were written, without repeats. */
export function mentionedContactIds(text: string, contacts: readonly ContactNameCandidate[]): string[] {
  const ids = resolveMentions(text, contacts).flatMap((mention) => mention.contactId ? [mention.contactId] : []);
  return [...new Set(ids)];
}

/**
 * What an editor needs to offer a picker: the mention being typed right now.
 * Returns null unless the caret sits inside an @ that has not been completed,
 * so the picker appears while writing a name and not while reading one back.
 */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const query = before.slice(at + 1);
  // A mention is one to three words. Anything longer is prose that happens to
  // sit after an @, and a picker over it would follow the advisor down the page.
  if (query.includes("\n") || query.split(/\s+/u).length > 3) return null;
  if (at > 0 && !/[\s(,;:]/u.test(text[at - 1]!)) return null;
  return { query, start: at };
}

/**
 * Replaces the mention being typed with the chosen name, ready to keep writing.
 *
 * The caret is read from the editor at the moment of choosing rather than
 * remembered from an earlier keystroke: a remembered one goes stale the instant
 * the advisor types another letter, and the text after it then gets kept as
 * well as replaced -- "@Deniz Aktaş Aktaş".
 */
export function completeMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const rest = text.slice(caret);
  // The completion already ends in a space; a second one would sit in the note.
  const completed = `@${name}${/^\s/u.test(rest) ? "" : " "}`;
  return {
    text: `${text.slice(0, start)}${completed}${rest}`,
    caret: start + completed.length,
  };
}
