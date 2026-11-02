# site/

The one-page site for [folkdanceplayer.com](https://folkdanceplayer.com): plain HTML, CSS and one
small script (`main.js`). It is not part of the Electron app and is never packaged into it
(`electron-builder.yml` packs only `out/`).

## Try it

```bash
python3 -m http.server 8765 -d site
```

Then open http://localhost:8765. The download buttons point at the latest release's page until
`main.js` has read the release from GitHub, and stay there if that fails.

## Hosting

Azure Static Web Apps (free tier). The `Deploy Site` workflow publishes `site/` when it changes on
`main`.

One-time setup:

1. In the Azure portal, create a **Static Web App** (Free plan, deployment source **Other**).
2. Copy its deployment token into the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
3. Add the custom domain (see below), then run **Deploy Site** from the Actions tab once.

Domain: `folkdanceplayer.com` is registered at GoDaddy. Static Web Apps needs a CNAME, which DNS
doesn't allow on a bare domain, so the nameservers point to an **Azure DNS** zone and the bare domain
is added as the app's custom domain. Registration stays at GoDaddy.

The zone `folkdanceplayer.com` is in the same resource group as the app, with:

- the four Azure nameservers set at GoDaddy (Domain → DNS → Nameservers → custom);
- a TXT record at `@` holding the app's validation token, created by
  `az staticwebapp hostname set --hostname folkdanceplayer.com --validation-method dns-txt-token`
  (`hostname show` prints the token);
- an **alias A record** at `@` pointing at the Static Web App resource (an alias, because the
  bare domain can't be a CNAME);
- a CNAME `www` to the app's `*.azurestaticapps.net` name, and `www.folkdanceplayer.com` added as a
  second custom domain.

Azure issues the HTTPS certificates itself. The bare domain can show a generic Microsoft
certificate for up to about fifteen minutes while its status is "Adding".

## Screenshots

The screenshots are 2× captures of the app in dark mode (a 1440×900 window), in `images/`.
Two features show a magnified circle over a screenshot; `scripts/make-site-lens.mts` draws those as
inline SVG between the `<!-- lens:NAME -->` markers in `index.html`. To change one, edit its entry
in that script and run `node scripts/make-site-lens.mts`. The other screenshots are plain
`<img>`s (cropped to the part their section is about).
