# Archived Decision Workspace prototype

This is the original Next.js application preserved from `d1e2cd0`. It is reference material, excluded from the new root application build and desktop package.

Do not deploy it or enter real provider credentials. The audit identified unauthenticated API routes, plaintext provider-key storage/return, unsafe resume semantics and fake/synthetic execution paths. Those findings remain relevant to this archive; the replacement does not magically secure the old app.

The historical tests are preserved as evidence of the original behavior, not counted as tests of the new runtime. There is no automatic migration of its JSON store.
