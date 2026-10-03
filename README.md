# Portal

An index of my projects that updates itself from GitHub.

**Live:** https://learner-agent-sudo.github.io/portal/ (after the one-time setup below)

Every day a GitHub Action reads my public repos, works out which ones have a
live site, and republishes this page on GitHub Pages. I never paste URLs in
here; I fill in each repo's **About** box on GitHub instead.

## One-time setup

1. In this repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions** tab → **Build and deploy portal** → **Run workflow**.

The page goes live a minute or two later.

## Adding a project

There is nothing to do in this repo. On the project's own GitHub page, click
⚙️ next to **About**:

| Field | What the portal does with it |
|---|---|
| **Description** | The text on the card. |
| **Website** | The **Open ↗** button. Leave it empty and tick *Use your GitHub Pages website* if the repo is on GitHub Pages. |
| **Topics** | Shown as tags and used for the filter chips. Two topics are special (below). |

The new project appears at the next daily run, or straight away if you click
**Run workflow**.

### The two special topics

- **`featured`**: puts the repo on the **Featured** view, which is what
  visitors see first. Use it for the projects you want to show off.
- **`hide`**: leaves the repo off the portal completely.

Everything else public shows up in **All** by itself. That makes **All** the
full list for me, and **Featured** the portfolio for everyone else.

## How the link on a card is chosen

1. A `url` override in `portal.config.json`, if there is one.
2. Otherwise the repo's **Website** field, unless its host is listed in
   `ignoreLinkHosts`. That list is set to `vercel.app` for now, because those
   deployments are down.
3. Otherwise, if GitHub Pages is switched on for the repo,
   `https://learner-agent-sudo.github.io/<repo>/`.
4. Otherwise there is no live link and the card shows **Code** only.

## What is left off automatically

Private repos are never read at all. Forks, archived repos, empty repos,
repos with the `hide` topic, and this portal itself are skipped. Each run's
page in the Actions tab has a table of every project with its link, and
lists the skipped repos with the reason.

## `portal.config.json`

Only needed for things GitHub's About box can't express.

```json
{
  "owner": "learner-agent-sudo",
  "title": "Projects",
  "tagline": "Things I have built, and the ones I am still building.",
  "featuredTopic": "featured",
  "hideTopic": "hide",
  "ignoreLinkHosts": ["vercel.app"],
  "exclude": ["some-repo"],
  "overrides": {
    "Playbook": { "title": "Contract Playbook", "featured": true },
    "some-other-repo": { "url": "https://example.com/where-it-really-lives/" }
  },
  "extra": [
    { "name": "my-other-site", "title": "Something not on GitHub", "url": "https://example.com", "description": "Hosted elsewhere." }
  ]
}
```

- `ignoreLinkHosts`: Website links on these hosts (and their subdomains) are
  ignored. Remove `vercel.app` from the list when those deployments work again.
- `overrides`: per repo, any of `title`, `description`, `url`, `topics`, `featured`, `hidden`.
- `extra`: sites that are not GitHub repos. Each needs a `url`. Give each one a
  `name` that won't change, so pins stay attached to it.

## Pins

The ☆ on each project pins it to a **Pinned** view. Pins are stored in the
browser you clicked them in, so nobody else sees them. They don't sync between
devices.

## Working on it locally

```sh
npm test                 # unit tests for the data builder
npm run preview          # builds from sample data, serves http://localhost:8000
npm run build-data       # builds from the real GitHub API (set GITHUB_TOKEN to avoid rate limits)
```

`test/fixtures/repos.json` is hand-made sample data, not real API output.

## Limits

- GitHub Pages sites are public, so everything on this page is public.
- Updates are daily or on demand, not the moment a repo changes.
- GitHub pauses scheduled runs in a public repo after 60 days with no commits
  to it, and emails you first. To restart: **Actions → Build and deploy portal
  → Enable workflow**, then **Run workflow**. Any commit here also resets the clock.
- Apps that need a server (API routes, databases, secret keys) can't run on
  GitHub Pages. If one is hosted somewhere else, put that address in its
  Website field and it gets an **Open ↗** button. Otherwise it shows **Code** only.
