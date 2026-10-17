# Portal

An index of my projects that updates itself from GitHub.

**Live:** https://learner-agent-sudo.github.io/portal/

Every day a GitHub Action reads my public repos, works out which ones have a
live site, and republishes this page on GitHub Pages. I never paste URLs in
here; I fill in each repo's **About** box on GitHub instead.

## One-time setup

1. In this repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions** tab → **Build and deploy portal** → **Run workflow**.

The page goes live a minute or two later.

**If the page shows this README instead of the project cards,** Source is set
to "Deploy from a branch". With that setting GitHub's own **pages build and
deployment** job publishes the repo files as they are. Re-running that job
doesn't help; switch Source to **GitHub Actions** and run **Build and deploy
portal**.

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

### Production and In development

The page has two sections:

- **Production** is what visitors see first: finished projects people can use.
- **In development** holds everything else, one click away (a tab, the
  button beside the section heading, and the tile at the end of Production).

A project is in **Production** when its repo name is in the `production` list
in `portal.config.json`. Adding the topic `production` (or `featured`) to the
repo on GitHub works too. Everything else, including any new repo, starts
in **In development**. To promote a project, add it to the list or give it
the topic.

The topic **`hide`** leaves a repo off the portal completely.

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
  "goatcounter": "myname",
  "featuredTopic": "featured",
  "hideTopic": "hide",
  "productionTopic": "production",
  "production": ["Stock-mon", "Pdf-md"],
  "ignoreLinkHosts": ["vercel.app"],
  "exclude": ["some-repo"],
  "overrides": {
    "Playbook": { "title": "Contract Playbook", "status": "production" },
    "some-other-repo": { "url": "https://example.com/where-it-really-lives/" }
  },
  "extra": [
    { "name": "my-other-site", "title": "Something not on GitHub", "url": "https://example.com", "description": "Hosted elsewhere." }
  ]
}
```

- `goatcounter`: your GoatCounter account name, which turns visit counting
  on (see below). Leave it `""` to keep it off.
- `production`: repo names shown in the Production section (case doesn't
  matter). The real file lists the current eight.
- `ignoreLinkHosts`: Website links on these hosts (and their subdomains) are
  ignored. Remove `vercel.app` from the list when those deployments work again.
- `overrides`: per repo, any of `title`, `description`, `url`, `topics`, `category`, `status` (`production` or `development`), `featured`, `hidden`.
- `extra`: sites that are not GitHub repos. Each needs a `url`. Give each one a
  `name` that won't change, so pins stay attached to it.

## What the page shows

- **Card images:** the deploy screenshots every live site (Playwright) into
  `site/thumbs/`. Projects without a live site get a cover with their name and
  a category icon.
- **Titles and descriptions:** from the About box if filled in, otherwise from
  the repo's README (its main heading and first paragraph).
- **Categories** (Legal, Finance, Learning, Tools, Research, Immigration,
  Faith, Sports, Other) are worked out from each title and description and
  power the filter chips. To set one yourself, add a GitHub topic with that
  name (e.g. `legal`) or a `category` override in `portal.config.json`.
- **Grid / Carousel** switch and a **Light / Dark / Auto** theme button. Both
  choices are remembered in the visitor's browser.

## Pins

The ☆ on each project pins it to a **Pinned** view. Pins are stored in the
browser you clicked them in, so nobody else sees them. They don't sync between
devices.

## Visit counts (GoatCounter)

Off until `goatcounter` in `portal.config.json` has an account name. Then
every page load is counted with [GoatCounter](https://www.goatcounter.com),
and the footer says so. GoatCounter uses no cookies and doesn't store IP
addresses. The dashboard is at `https://<account name>.goatcounter.com`.

- **Tagged links.** Add `?ref=` to the address you hand out, e.g.
  `https://learner-agent-sudo.github.io/portal/?ref=cv` on the resume and
  `?ref=li` on LinkedIn. The tag shows up under **Referrers** in the
  dashboard. Anyone can see the tag in the link, so keep tags neutral.
- **Skip your own visits.** Open the portal once in each browser you use with
  `#toggle-goatcounter` on the end of the address. A popup confirms it. If
  you only edit the address bar, press reload so the popup appears. Doing it
  again turns counting back on. GoatCounter's *Settings → Tracking → Ignore
  IPs* works too.
- **What it can't see.** Visitors whose ad blocker blocks GoatCounter.
  Switching between Production and In development is not a new page load, so it
  isn't counted. Visits to `localhost` (local previews) are never counted.

## Site checks (Healthchecks.io)

The **Check live site** workflow runs every 6 hours. It checks:

- the portal page (and that it is the portal, not this README);
- the project list, and that it was rebuilt in the last 48 hours, which
  catches a stopped daily rebuild;
- every project's live link.

Once a day, and when run by hand, it also opens the portal in a real browser
and checks that the cards appear. A failure is retried once before it counts.

None of this affects GoatCounter: the link check runs no JavaScript, and the
browser check blocks GoatCounter.

Each run tells Healthchecks.io "OK" or "fail", with the report attached, and
Healthchecks.io emails you. If runs stop altogether, Healthchecks.io notices
the silence and emails you too. Setup: create a check with period 6 hours and
grace 1 hour, then put its ping URL in a repository secret named
`HEALTHCHECKS_PING_URL` (**Settings → Secrets and variables → Actions**). Keep
it a secret: anyone with the URL could send fake "OK"s. Without the secret
the checks still run, and a failed run shows red in the Actions tab.

To run it now: **Actions → Check live site → Run workflow**.

## Working on it locally

```sh
npm test                 # unit tests for the data builder and the site check
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
