# Proxy Safety

Public proxying is disabled by default to prevent third-party deceptive pages from being served under the MasarWeb domain.

## Access policy

Both `ENABLE_PROXY=true` and a nonempty `ALLOWED_TARGET_DOMAINS` list are required. Hosts match exactly; subdomains need separate entries. Only HTTPS on port 443 without embedded credentials is accepted.

The guard covers every HTTP method under `/browse` and `/proxy` before session creation or outbound requests. Disabled routes return 410 with no-store headers. The homepage offers tools and articles instead of a browsing form.

## Content isolation

Approved responses use CSP sandbox without permissions, disabling scripts, forms, popups, downloads, and same-origin access. Only a small set of passive content types is served; attachment responses and unapproved redirects are blocked.

WebSocket proxy startup also requires the HTTP proxy access policy. Private and metadata addresses remain blocked, including resolved DNS addresses.

## Retired scanner

The scanner page and both legacy and simulation API paths return 410 for all methods. Fabricated antivirus verdicts and vendor names have been removed from the scanner implementation and its tool card is removed.

## Release verification

Deploy the reviewed commit to the project actually serving the affected domain, with `ENABLE_PROXY=false`. Purge any cached proxy responses. Check previously flagged URLs return 410, then request Google's security review after all reported deceptive pages are removed.
