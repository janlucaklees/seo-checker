.PHONY=build
build:
	bun build --target node --outfile seo-checker.mjs main.js
