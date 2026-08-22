// The Meta Graph API version, in one place.
//
// It used to be a `const GRAPH_VERSION = "v23.0"` copy-pasted into four modules
// (lib/instagram/graph-api.ts, the Instagram and Facebook publish adapters, and
// lib/auto-reply/graph-calls.ts). Bumping a version therefore meant finding all
// four, and missing one meant two halves of the app talking to different API
// versions with no error to say so.
//
// Overridable with META_GRAPH_VERSION so a version bump can be tested — and
// rolled back — without a deploy, the same pattern META_IG_SCOPES uses.
//
// Pure module (no `server-only`): the version string is not a secret and the
// tests import it directly.

const DEFAULT_GRAPH_VERSION = "v23.0";

export const GRAPH_VERSION =
  process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Threads is a separate product with its own host and its own (unversioned in
// practice, v1.0) path. It is not a Graph API version and does not move with
// GRAPH_VERSION.
export const THREADS_BASE = "https://graph.threads.net/v1.0";
export const THREADS_OAUTH_BASE = "https://graph.threads.net";
