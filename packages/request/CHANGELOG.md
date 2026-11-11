# @sanely/request

## 0.1.0

### Minor Changes

- 772a230: Add `ip` and `geo` to read a request's client IP address and location

  `ip(request, { platform })` reads the client IP from the headers of the platform the app runs on, which a client cannot forge. With `platform: "none"`, it reads the connection and falls back to common forwarding headers such as `X-Forwarded-For`. Pass `proxies`, parsed once with `parseProxies`, to skip your own proxies and load balancers. `geo(request, { platform })` reads the location that the platform reports. Both accept a Fetch `Request` or a Node.js-style request.
