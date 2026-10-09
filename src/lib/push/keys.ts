// The public VAPID key is public by design (the browser needs it to subscribe),
// so it lives in the code; an env var can override it. The private key and
// PUSH_SECRET stay in Vercel env only.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BHxZ7oULvNrBB43_D2qLwIdeYyzMP135vRqZIeTRE7QyBiZgrz5iiSkKlz7SptOMOu_9P-pfOXFmPnnUBt7luwY";
