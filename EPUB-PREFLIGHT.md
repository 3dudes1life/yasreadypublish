# EPUB Preflight — v1.0.10

The Kindle release gate verifies the Story-Locked source and the generated EPUB package.

Blocking checks include Story Lock, exact source coverage, metadata, cover packaging, detected chapter navigation, visible Contents, logical navigation/landmarks, supported asset handling, KDP section/file guards, source placeholders, and the finished-package audit.

The finished-package audit opens YasReady's generated package data and confirms that production EPUB output contains no Preview Studio-only CSS/classes/hooks.

Likely source placeholders are never silently deleted. They must be corrected deliberately in the master manuscript before a production EPUB can be marked ready.
