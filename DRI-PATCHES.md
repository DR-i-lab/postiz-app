# Postiz for DR-I

This branch is [Postiz](https://github.com/gitroomhq/postiz-app) `v2.25.3` with a few patches,
built as `ghcr.io/dr-i-lab/postiz-app:v2.25.3-dri.N` and run by DR-I S.r.l. Postiz is licensed
under the AGPL-3.0 (see `LICENSE`): this repository is the source of that image.

| Commit | Change |
|--------|--------|
| `fix(instagram)` | A reel cover (`thumbnail`) that is not a JPEG is converted to JPEG before publishing: Meta takes `cover_url` only as a JPEG. |
| `fix(media)` | The cover modal keeps a `thumbnailTimestamp` of 0 instead of saving it as `null`. |
| `feat(media)` | Previews, the editor's media strips and the media library show a video's cover instead of its first frame. |
| `feat(tiktok)` | TikTok post settings follow TikTok's Content Sharing Guidelines (privacy from `creator_info` with no default, interactions off by default, Music Usage declaration always shown, "Paid partnership" label, branded content can't be private). |
| `feat(branding)` | The visible product name and logo are "DR-I Social Publisher" and DR-I's logo (login, sidebar, page titles, preview page, favicon, English texts and emails); terms and privacy links point to dr-i.tech; a "Source code" link points here. Copyright and licence notices in the sources are untouched. Internal names (packages, env vars, API headers, CLI/MCP commands) keep the upstream name. |
| `ci` | Only `build-dri.yml` builds images; the upstream workflows are removed from this branch. |

To move to a new upstream version: branch `dri/vX.Y.Z` from the upstream tag, cherry-pick the
patches, tag `vX.Y.Z-dri.1`.
