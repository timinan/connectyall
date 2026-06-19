// Builds the message the user sends to their contact after a meeting.
//
// Template:
//   Hey {first}, it was great meeting and chatting about {recap} with you!
//
//   Connect with me: {shareUrl}
//
// The recap is inserted into the middle of an English sentence, so it must
// grammatically continue "chatting about ___ with you". That's a noun phrase
// in lowercase, no trailing period. The ExtractionService prompt enforces
// this on the LLM side; this helper cleans up the worst tail-end punctuation
// on the way out so a stray "." or "!" doesn't double up. We do NOT lowercase
// the first letter — recap may legitimately start with a proper noun (USDC,
// Google), and the prompt already guides the model toward lowercase pronouns
// like "her" / "his" / "their" when the topic isn't a proper noun.

const TRAILING_PUNCT = /[.!?]+\s*$/;

function trimRecap(recap: string): string {
  return recap.trim().replace(TRAILING_PUNCT, '').trim();
}

export function buildShareMessage(input: {
  contactName: string;
  recap: string;
  shareUrl: string | null;
}): string {
  const { contactName, recap, shareUrl } = input;
  const firstName = contactName.trim().split(/\s+/)[0] || contactName.trim() || 'there';
  const cleanRecap = trimRecap(recap);

  const opener = cleanRecap
    ? `Hey ${firstName}, it was great meeting and chatting about ${cleanRecap} with you!`
    : `Hey ${firstName}, it was great meeting you!`;

  if (!shareUrl) return opener;
  return `${opener}\n\nConnect with me: ${shareUrl}`;
}
