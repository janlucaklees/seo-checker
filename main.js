#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { program } = require("commander");
const ignore = require("ignore");
const fg = require("fast-glob");
const cheerio = require("cheerio");
import chalk from "chalk";

program
  .name("seo-tech-check")
  .arguments("<dir>")
  .description(
    "Static SEO audit for legacy projects using schema.org, meta tags, favicons, and more",
  )
  .action(async (dir) => {
    const base = path.resolve(dir);

    // Load .gitignore patterns
    const ig = ignore();
    const gitignorePath = path.join(base, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, "utf8"));
    }

    // Find files
    const entries = await fg(["**/*.html", "**/*.twig", "**/*.php"], {
      cwd: base,
      onlyFiles: true,
      dot: true,
      absolute: true,
    });
    const files = entries.filter((f) => {
      const rel = path.relative(base, f);
      return ig.filter([rel]).length > 0;
    });
    if (files.length === 0) {
      console.log(chalk.yellow("⚠️ No files found for analysis."));
      process.exit(1);
    }

    // Initialize subtests
    const metaTests = {
      doctype: false,
      htmlLang: false,
      titleTag: false,
      metaTitle: false,
      metaDescription: false,
      metaCharset: false,
      metaRobots: false,
      canonical: false,
      favicons: false,
    };
    const schemaTests = { inline: false, jsonld: false };
    const socialTests = {
      ogTitle: false,
      ogDescription: false,
      ogImage: false,
      twitterCard: false,
      twitterTitle: false,
      twitterDescription: false,
    };
    const imagesMissing = new Set();

    // Regex definitions
    const re = {
      doctype: /<!DOCTYPE\s+html>/i,
      htmlLang: /<html[^>]*\slang=['"].+?['"]/i,
      titleTag: /<title>.*?<\/title>/i,
      metaTitle: /<meta[^>]*name=['"]title['"][^>]*>/i,
      metaDescription: /<meta[^>]*name=['"]description['"][^>]*>/i,
      metaCharset: /<meta\s+charset=['"][^'"]+['"]/i,
      metaRobots: /<meta[^>]*name=['"]robots['"][^>]*>/i,
      canonical: /<link[^>]*rel=['"]canonical['"][^>]*>/i,
      favicons:
        /<link[^>]*rel=['"](?:icon|apple-touch-icon|shortcut icon|manifest)['"][^>]*>|<meta[^>]*name=['"]msapplication-TileImage['"][^>]*>/i,
      inlineSchema: /itemscope[^>]*itemtype=/i,
      jsonld: /<script[^>]*type=['"]application\/ld\+json['"][\s\S]*?>/i,
      ogTitle: /<meta[^>]*property=['"]og:title['"][^>]*>/i,
      ogDescription: /<meta[^>]*property=['"]og:description['"][^>]*>/i,
      ogImage: /<meta[^>]*property=['"]og:image['"][^>]*>/i,
      twitterCard: /<meta[^>]*name=['"]twitter:card['"][^>]*>/i,
      twitterTitle: /<meta[^>]*name=['"]twitter:title['"][^>]*>/i,
      twitterDescription: /<meta[^>]*name=['"]twitter:description['"][^>]*>/i,
    };

    // Scan files
    for (const file of files) {
      let content;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch (e) {
        continue;
      }
      const relPath = path.relative(base, file);

      // Meta-data via regex
      if (!metaTests.doctype && re.doctype.test(content))
        metaTests.doctype = true;
      if (!metaTests.htmlLang && re.htmlLang.test(content))
        metaTests.htmlLang = true;
      if (!metaTests.titleTag && re.titleTag.test(content))
        metaTests.titleTag = true;
      if (!metaTests.metaTitle && re.metaTitle.test(content))
        metaTests.metaTitle = true;
      if (!metaTests.metaDescription && re.metaDescription.test(content))
        metaTests.metaDescription = true;
      if (!metaTests.metaCharset && re.metaCharset.test(content))
        metaTests.metaCharset = true;
      if (!metaTests.metaRobots && re.metaRobots.test(content))
        metaTests.metaRobots = true;
      if (!metaTests.canonical && re.canonical.test(content))
        metaTests.canonical = true;
      if (!metaTests.favicons && re.favicons.test(content))
        metaTests.favicons = true;

      // Schema.org
      if (!schemaTests.inline && re.inlineSchema.test(content))
        schemaTests.inline = true;
      if (!schemaTests.jsonld && re.jsonld.test(content))
        schemaTests.jsonld = true;

      // Social media
      if (!socialTests.ogTitle && re.ogTitle.test(content))
        socialTests.ogTitle = true;
      if (!socialTests.ogDescription && re.ogDescription.test(content))
        socialTests.ogDescription = true;
      if (!socialTests.ogImage && re.ogImage.test(content))
        socialTests.ogImage = true;
      if (!socialTests.twitterCard && re.twitterCard.test(content))
        socialTests.twitterCard = true;
      if (!socialTests.twitterTitle && re.twitterTitle.test(content))
        socialTests.twitterTitle = true;
      if (
        !socialTests.twitterDescription &&
        re.twitterDescription.test(content)
      )
        socialTests.twitterDescription = true;

      // Images via Cheerio
      const $ = cheerio.load(content, { xmlMode: false });
      $("img").each((i, el) => {
        const alt = $(el).attr("alt");
        if (!alt || alt.trim() === "") {
          imagesMissing.add(relPath);
        }
      });
    }

    // Helper for printing groups
    const okIcon = chalk.green("✅");
    const warnIcon = chalk.yellow("⚠️");
    const failIcon = chalk.red("❌");

    function printGroup(name, tests) {
      const keys = Object.keys(tests);
      const passed = keys.filter((k) => tests[k]).length;
      if (passed === keys.length) {
        console.log(`${okIcon} ${chalk.bold(name)}`);
      } else if (passed === 0) {
        console.log(`${failIcon} ${chalk.bold(name)}`);
      } else {
        console.log(`${warnIcon} ${chalk.bold(name)}`);
      }
      // List details if incomplete or failed
      if (passed < keys.length) {
        for (const key of keys) {
          const icon = tests[key] ? okIcon : failIcon;
          console.log(`  ${icon} ${key}`);
        }
      }
    }

    // Print results
    console.log(chalk.underline("SEO Audit Report:"));
    printGroup("Meta-Data", metaTests);
    printGroup("Schema.org", schemaTests);
    printGroup("Social-Media Tags", socialTests);

    // Images group
    if (imagesMissing.size === 0) {
      console.log(
        `${okIcon} ${chalk.bold("Images")} (all <img> tags have alt attributes)`,
      );
    } else {
      console.log(
        `${warnIcon} ${chalk.bold("Images")} (missing alt attributes)`,
      );
      for (const file of imagesMissing) {
        console.log(`  ${failIcon} ${file}`);
      }
    }
  });

program.parse(process.argv);
