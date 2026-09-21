This is the specification for the firefox extension smart-blocker-jev


# high level overview
People have unrestricted access to the internet and it is hurting them. people
want to be able to regulate their own internett usage better but the tools are
not there.
smart blocker jev solves this by combining to factors. website metadata and
content with a user intention

earlier ai systems have simply been to slow for this to be effective
smart blocker jev uses the new jev model to quickly do the following task very
effeciently quickly and cheaply. 
take some user intention about how they want to use the internet. take some
website metadta such as domain name and content such as html rendered or
un rendrerd and make a decision NETRUAL decision wether or not this site matches
the user intention.

smart blocker jev uses jev to return a distrubution for how certian jev must be.
what certiantiy counts as a false and a true is toggleable within the extension
settings with resabnole defaults. 

the decision the jev model makes is used by the rest of the extension to either
let the user work uninturrept or to redirect the user to some site which states
the decision jev made and that you tried to view something which does not match
your intentions.

The websites which are blocked are added to a temproary blocklist which is rset
each time you alter the user intention or waht counts as true or false in regard
to `website_is_blocked` such that we get quick lookup when possible without
storing stale information about if it should be blocked or not. it is also
possible to flush the blocked list within the extension.


# lower level
all ai invocations should be heavily guarded against quick successive calls and
infinte loops as it is very important to avoid pricing issues 

you can view the typesafe docs folder in this project


# webiste information given

# Firefox extension: collecting page info to check if content matches the user's stated intent

## Most useful signals to collect (in order of value per token)

1. **URL + registrable domain**: `location.href`, parsed query params, and the eTLD+1 (use the Public Suffix List). The query string often holds the search terms.
2. **Title + meta description + `og:type` / `og:site_name`**: a page's own summary of itself, a few dozen tokens.
3. **JSON-LD / schema.org types**: the cleanest machine-readable statement of what a page is (Product, Article, Recipe, etc.).
4. **Heading outline (h1 to h3)**: a cheap table of contents.
5. **Cleaned main text**: the actual content, truncated.
6. **Page-type flags**: password field present, form action domains, outbound link domains, third-party script domains. Useful for spotting login, checkout, or phishing pages.
7. **Context**: referrer, redirect chain, and whether the user has visited before (`history.getVisits`).

Skip cookies, TLS details, and behavioural signals unless there is a specific reason. They cost permissions and add little for intent matching.

## Getting the rendered DOM down to size

Run everything in the content script, on the live DOM, so JS-rendered content is included. Do not use w3m: it cannot run inside an extension (native messaging is the only route, and it adds an install step for users).

1. **Strip noise** from a cloned DOM: `script, style, noscript, svg, iframe, nav, footer, aside, [aria-hidden=true]`, and cookie/consent banners.
2. **Extract main content** with Mozilla's `Readability.js`. If it returns null or a very short result (stores, dashboards, apps), fall back to `innerText` of `main` or `body`.
3. **Convert to compact text**: `innerText`, or Turndown for markdown if headings, lists, and links should be kept.
4. **Collapse and dedupe**: squash whitespace, drop repeated lines, cap link lists.
5. **Truncate** to a fixed budget, e.g. the first ~1,500 tokens (head plus a little of the tail), rather than sending everything.

Typical result: a 500 KB DOM becomes about 1 to 2 KB of text, plus a ~500 byte metadata blob.

## Payload to send to the model

```json
{
  "url": "...",
  "domain": "...",
  "title": "...",
  "description": "...",
  "og_type": "...",
  "schema_types": ["Product"],
  "headings": ["..."],
  "flags": {"password": false, "form_actions": [], "third_party": 12},
  "text": "cleaned, truncated main content"
}
```

## Content script sketch

```js
// content.js
const meta = (n) =>
  document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content;

const payload = {
  url: location.href,
  hostname: location.hostname,
  title: document.title,
  lang: document.documentElement.lang,
  description: meta("description"),
  ogType: meta("og:type"),
  jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent)
    .slice(0, 3),
  headings: [...document.querySelectorAll("h1,h2,h3")]
    .map((h) => h.innerText.trim())
    .slice(0, 25),
  hasPassword: !!document.querySelector("input[type=password]"),
  text: document.body.innerText.slice(0, 8000),
};

browser.runtime.sendMessage(payload);
```

## Keep the AI calls rare (tiered pipeline)

- **Tier 0, rules**: domain allow/block lists and keyword matching against the stated intent. Free.
- **Tier 1, local embeddings** (transformers.js in the extension): compare the intent to title, headings, description, and JSON-LD. Confident matches and mismatches stop here.
- **Tier 2, LLM**: only for ambiguous pages, using the payload above.
- **Cache** verdicts per URL and domain so revisits cost nothing.

## Other useful data (optional, needs extra permissions)

- Redirect chain: `webRequest.onBeforeRedirect` or `webNavigation`
- TLS info: `webRequest.getSecurityInfo()` (issuer, validity, secure or not)
- Response headers: `webRequest.onHeadersReceived`
- Language: `tabs.detectLanguage()`
- Canonical link and `hreflang` alternates
- Cross-origin iframes: content scripts with `all_frames: true`
- Closed shadow DOM: `element.openOrClosedShadowRoot` (Firefox only)
- SPAs: use a `MutationObserver` or wait for idle, since content changes without navigation
- Screenshot for a vision model: `tabs.captureTab()`
- External enrichment (domain age via RDAP, reputation, category) needs an outside API or your own backend

## Permissions and privacy

- `activeTab` + `scripting` is the least invasive setup (only the page the user acts on). Automatic checking of every page needs `<all_urls>` content scripts.
- `webRequest` covers security info, headers, and redirects. `tabs` exposes URL and title for all tabs. `history` and `cookies` are separate permissions.
- Skip incognito tabs by default (`tab.incognito`).
- Never send form values or password fields to a remote model.
- Exclude sensitive categories (banking, webmail) by default, or require explicit consent.
- Sending page content to a third-party AI counts as data collection. Firefox/AMO expects it to be declared (see the `data_collection_permissions` manifest key), so check the current AMO policy before publishing.


