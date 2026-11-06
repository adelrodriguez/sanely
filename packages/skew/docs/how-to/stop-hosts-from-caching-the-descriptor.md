# How to stop hosts from caching the descriptor

If a browser, CDN, or proxy caches `/_crispen/deployment.json`, the client reads an old target and never sees the new deployment. The descriptor response must have these headers:

```text
Cache-Control: no-store
Content-Type: application/json
```

The Next.js adapter sets them for you, except with `output: "export"`. For a Vite build or a static export, add a rule on your host.

## Cloudflare Pages or Netlify

Add a `_headers` file to the build output:

```text
/_crispen/deployment.json
  Cache-Control: no-store
  Content-Type: application/json
```

## Vercel

Add the rule to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/_crispen/deployment.json",
      "headers": [{ "key": "Cache-Control", "value": "no-store" }]
    }
  ]
}
```

## Nginx

```nginx
location = /_crispen/deployment.json {
  add_header Cache-Control "no-store" always;
  try_files $uri =404;
}
```

## Check the response

After each change to the host config, request the descriptor from production:

```sh
curl -i https://example.com/_crispen/deployment.json
```

Make sure that the response has these properties:

- Status `200`.
- A `Content-Type` that contains `json`.
- `Cache-Control: no-store`.
- A body whose `id` is the ID of the deployment that is live now.

If the response is HTML, a single-page-app fallback rule caught the path. Exclude the descriptor path from that rule. Until you do, each check records a `not-json` error, and the status stays at its last value.
