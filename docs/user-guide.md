# Smart Blocker Jev: User Guide

Smart Blocker Jev blocks web pages that don't match what you said you want to
use the internet for. You describe your intention in plain words, and the jev
model checks each page you open against it.

## Getting started

1. Install the extension and open its **Settings** (toolbar icon → *Settings*).
2. Click **Save** in Settings. The default endpoint is the TypeSafe jev model, so
   nothing else is needed. For another endpoint (self-hosted or open-source model),
   put its URL in **Endpoint URL** and, if it asks for one, an **API key**.
3. Click the toolbar icon and write your **intention**, for example
   *"Learning about Buddhism"* or *"Writing my thesis on coastal erosion"*.
   Click **Save**.

That's it. Every page you open from now on is checked.

## How pages are checked

When a page loads, the extension reads a short summary of it (address, title,
description, headings and an excerpt of the text) and asks jev how likely it
is that the page matches your intention.

- **Likely a match:** the page stays open.
- **Unlikely to match:** you're sent to a page explaining the decision, showing
  jev's score and your intention. Click **Go back** to return.

Each verdict is remembered, so revisiting a page is instant and costs nothing.

## Settings

### Strictness

A slider sets the score a page needs to be shown. Pages scoring below it are
blocked. Move it right to block more, left to block less. The default is 30%.

### Strict mode

When enabled, every page is hidden behind a *"Checking this page…"* screen
(and muted) until jev has confirmed it matches, so you never see content that
doesn't. Pages you've already verified, or that are on your allow list, show
immediately.

If a page can't be checked (see *Limits* below), the screen tells you why and
offers **Show page anyway**.

### Domain rules

One rule per line. A rule is either:

- **A domain.** It also covers its subdomains, so `youtube.com` includes
  `m.youtube.com`.
- **A regular expression between slashes.** It's matched case-insensitively
  against both the site's hostname and the full page address, so you can
  target parts of a site:

  | Rule | Matches |
  | --- | --- |
  | `/youtube\.com\/shorts/` | YouTube Shorts, but not the rest of YouTube |
  | `/^(www\.)?reddit\.com$/` | reddit.com and www.reddit.com, but not old.reddit.com |
  | `/[?&]q=.*recipe/` | any search containing "recipe" |

  A pattern that isn't a valid regular expression is rejected when you save.

| List | Effect |
| --- | --- |
| **Always allow** | Shown without asking jev. |
| **Always block** | Blocked without asking jev. |
| **Never check** | Shown and never sent to jev. Use this for private sites. Webmail and common login pages are listed by default. |

### Limits

To keep API costs predictable, the extension by default waits at least 100 ms
between checks and makes at most 120 checks per minute and 10,000 per day. You
can change these in settings. The daily limit can go up to 100,000, and the
other two can't be set any looser than their defaults.

After repeated API errors, checking pauses for 5 minutes. If your API key is
rejected, it pauses until you enter a new one. The popup shows when checking
is paused and has a **Resume now** button.

In normal mode, a page that can't be checked is shown.

### Import and export

Under **Import and export** in settings you can save all your settings to a
`.toml` file, and load them back on another computer or after reinstalling.

- **Export settings** downloads your saved settings. Your API key is left out
  unless you tick *Include my API key*. Don't share a file that contains it.
- **Import settings…** loads a file. Only the settings in the file change;
  anything left out keeps its current value. If any value is invalid, nothing
  is changed and every problem is listed.

An exported file looks like this and can be edited by hand:

```toml
version = 1

[general]
enabled = true
intention = "Learning about Buddhism"
threshold = 0.3
strict_mode = false

[api]
endpoint = "https://api.typesafe.ai/v1/systemone"
model = "jev-latest"
# key = "your API key, only if your endpoint needs one"

[rules]
always_allow = []
always_block = [ '/youtube\.com\/shorts/', "tiktok.com" ]
never_check = [ "mail.google.com" ]

[limits]
min_interval_ms = 100
max_calls_per_minute = 120
max_calls_per_day = 10000
```

Tip: write regular expressions in single quotes (`'...'`) so backslashes don't
need doubling.

## The toolbar popup

- **On:** turn the extension on or off.
- **Intention:** view or change what you're here for.
- **This tab:** whether the current page was allowed, blocked or skipped, and why.
- **Flush verdicts:** forget all remembered decisions, so pages are checked again.
- **Debug log:** see exactly what was sent to jev and what it answered for the
  last 50 checks. The log is cleared when Firefox closes.

Changing your intention or the strictness slider flushes remembered verdicts
automatically.

## Privacy

- Page summaries are sent only to the endpoint you configured, and with your key
  only if you set one.
- What you type into forms and password fields is never read or sent.
- Private windows are never checked.
- Sites on the *Never check* list, and any site with "bank" in its name, are
  never sent.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Nothing is being blocked | Check that the extension is **On** and an intention is set. The popup's *This tab* card shows the reason. |
| A page you need is blocked | Lower the strictness slider, reword your intention, or add the site to **Always allow**. |
| A distracting page gets through | Raise the slider or add the site to **Always block**. Then click **Flush verdicts**. |
| "Checking paused" in the popup | You hit a limit or the API failed. Wait, or click **Resume now**. |
| Want to see why jev decided something | Open the **Debug log** from the popup. |
