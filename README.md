# PREFACE
This is a totally AI generated project. This is proof of concept of how  jev could be used for helping users navigate the internet to avoid things unrelated to their goals.


# Smart Blocker Jev

A Firefox extension that helps you use the internet the way you intend to.

## Why

The internet is always one click away from a distraction. Classic site blockers
don't help much: a fixed list of domains can't tell research on YouTube from an
evening lost to it. Smart Blocker Jev blocks by **intent** instead of domain.

## How it works

1. You write down what you want to use the internet for right now, for example
   *"Researching and writing my thesis on coastal erosion"*.
2. When you open a page, the extension collects a small summary of it (URL,
   title, description, headings and a short excerpt of the main text).
3. TypeSafe's **jev** model gives the probability that the page matches your
   intention. It's fast and cheap enough to run on every page you open.
4. Pages that clearly don't match are replaced with a page explaining the
   decision. Pages that match, or where jev is unsure, load normally.

Verdicts are cached, so a page you revisit doesn't need a new check. Changing
your intention or thresholds clears the cache. Strict rate limits and daily
caps keep API costs predictable.

## Privacy

- Page content is sent only to the TypeSafe API, using your own API key.
- Form fields and password values are never read.
- Private windows, webmail, login pages and banking sites are never checked.

## Getting started

```sh
npm install
npm start   # launches Firefox with the extension loaded
```

Then open the extension settings, add your TypeSafe API key, and set your
intention from the toolbar popup.
