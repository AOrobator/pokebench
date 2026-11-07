# Pause the run during provider waits

The November 7 operator request is to suspend gameplay and its active wall
budget while the gateway holds a rate-limited model request.

## RED

The seven new no-I/O run-control cases failed on the missing call hooks.
The 29 existing cases passed. The pinned Pi loop and state-only loop also
have in-memory cases that drive a provider pause from the transport and
observe the completed reply before either loop can execute its tool.

## Scope

The switch defaults on for all lanes. The gateway keeps its existing backoff.
This change does not authorize a run launch or a viewer restart.
