# No runtime dependencies

The package has no runtime dependencies. Durations are whole milliseconds, and the documentation shows humanspan (`ms("1h")`) for readable durations. Errors are plain `Error` subclasses with typed fields. faultier belongs in application code, which can wrap these errors.
