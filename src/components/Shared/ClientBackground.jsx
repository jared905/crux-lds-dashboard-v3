/**
 * ClientBackground — ambient page-top field.
 *
 * Was a per-client stock photo (space, mountains) dissolving into the
 * page; stock imagery read as impersonal. Replaced by a generated
 * field: the client's accent colour (set per client by ThemeProvider
 * as --accent-dim) melting in from above the fold, broken by film
 * grain. Same visual language as the login key art, at whisper volume.
 *
 * ClientManager still stores background_image_url per client; it is
 * intentionally unused here. Restore the old <img> branch from git
 * history if per-client photos ever come back.
 */

export default function ClientBackground() {
  return <div className="ambient-bg animate-fade" aria-hidden="true" />;
}
