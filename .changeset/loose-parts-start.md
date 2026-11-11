---
"@sanely/rpc": minor
---

Fix `receivePort` waiting forever when the page calls it after the port arrived

`relayPort` posted each port into the page as soon as it arrived, and the page loses a window message it isn't listening for yet. Now `receivePort` asks for a port when it starts listening, and `relayPort` holds each port until a page asks. The page can call `receivePort` at any time, such as from a module that loads late, or before the relay starts. Receivers waiting at the same time each get their own port, and a port on its way to a receiver that gives up goes to the next one.

If your page reads the relayed port with its own `message` listener instead of `receivePort`, it no longer receives the port. To migrate, call `receivePort` with the same channel string in the renderer.
