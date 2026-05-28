# Shared Logger

Vendor-neutral structured operational logging for agents and runtime services.

Logs are JSON-formatted and include agent scope, correlation ID, route, duration, metadata, and error information. This module intentionally avoids external monitoring vendors so the platform can later forward the same log entries to any observability backend.
