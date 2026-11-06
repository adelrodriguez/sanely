# Descriptor and embed reference

Crispen uses two data formats. The descriptor tells a client its target deployment. The embed tells a client its running deployment. App code does not read either format. A custom adapter or a control-plane service must write them exactly as this page describes.

## Descriptor

The default URL is `/_crispen/deployment.json` on the application origin. An adapter `endpoint` option can change it.

```json
{ "v": 1, "id": "3f9c2a1", "builtAt": "2026-08-10T12:00:00.000Z" }
```

| Field     | Type     | Required | Description                                          |
| --------- | -------- | -------- | ---------------------------------------------------- |
| `v`       | `1`      | Yes      | The format version.                                  |
| `id`      | `string` | Yes      | The target deployment ID. Must not be empty.         |
| `builtAt` | `string` | No       | The build time of the target, as an ISO 8601 string. |

### Response requirements

- Status `200`.
- `Content-Type` that contains `json`, for example `application/json`.
- `Cache-Control: no-store`.

### Parse rules

`parseDescriptor` applies these rules, in this order:

1. If the text is not JSON, it throws `invalid-json`.
2. If `v` is not a positive integer, it throws `unsupported-version`.
3. If `id` is not a non-empty string, it throws `invalid-shape`.
4. If `builtAt` is not a string or is not a valid date, it ignores `builtAt`.

The parser accepts a `v` higher than `1` when `id` is valid, and it ignores unknown fields. A future format must keep `id` as a non-empty string, because old clients read only `id` and `builtAt`.

## Embed

The adapter writes the embed into the page before application scripts run:

```js
globalThis.__CRISPEN__ = {
  v: 1,
  running: { id: "3f9c2a1", builtAt: "2026-08-10T12:00:00.000Z" },
  endpoint: "/_crispen/deployment.json",
}
```

| Field             | Type     | Required | Description                                                      |
| ----------------- | -------- | -------- | ---------------------------------------------------------------- |
| `v`               | `1`      | Yes      | The format version. Any other value makes the embed invalid.     |
| `running.id`      | `string` | Yes      | The running deployment ID. Must not be empty.                    |
| `running.builtAt` | `string` | No       | The build time of the running deployment, as an ISO 8601 string. |
| `endpoint`        | `string` | No       | The descriptor URL. Defaults to `/_crispen/deployment.json`.     |

`readEmbed()` returns `undefined` for an embed that does not match this shape.
