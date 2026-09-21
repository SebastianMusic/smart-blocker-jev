# Smart Blocker Jev: User Guide

Smart Blocker Jev blocks web pages that don't match what you said you want to
use the internet for. You describe your intention in plain words, and the jev
model checks each page you open against it.

## Getting started

1. Install the extension and open its **Settings** (toolbar icon → *Settings*).
2. Paste your **TypeSafe API key** and click **Save**.
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

One domain per line. A domain also covers its subdomains, so `youtube.com`
includes `m.youtube.com`.

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

- Page summaries are sent only to the TypeSafe API, using your own key.
- What you type into forms and password fields is never read or sent.
- Private windows are never checked.
- Sites on the *Never check* list, and any site with "bank" in its name, are
  never sent.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Nothing is being blocked | Check that the extension is **On**, an intention is set, and an API key is saved. The popup's *This tab* card shows the reason. |
| A page you need is blocked | Lower the strictness slider, reword your intention, or add the site to **Always allow**. |
| A distracting page gets through | Raise the slider or add the site to **Always block**. Then click **Flush verdicts**. |
| "Checking paused" in the popup | You hit a limit or the API failed. Wait, or click **Resume now**. |
| Want to see why jev decided something | Open the **Debug log** from the popup. |
