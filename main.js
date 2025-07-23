#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { Command } from "commander";
import ignore from "ignore";
import fg from "fast-glob";
import Cheerio from "cheerio";
import chalk from "chalk";

// Define tests
const tests = [
  {
    name: "Doctype",
    group: "Meta-Data",
    failText: "No Doctype was found!",
    regex: /<!DOCTYPE\s+html\b/i,
  },
  {
    name: "HTML Lang",
    group: "Meta-Data",
    failText: "No <html lang> attribute found!",
    regex: /<html\b[^>]*\slang=\s*['"][^'"]+/i,
  },
  {
    name: "Title Tag",
    group: "Meta-Data",
    failText: "No <title> tag found!",
    regex: /<title\b/i,
  },
  {
    name: "Meta Description",
    group: "Meta-Data",
    failText: 'No <meta name="description"> tag found!',
    regex: /<meta\b[^>]*name=\s*['"]description['"]/i,
  },
  {
    name: "Meta Viewport",
    group: "Meta-Data",
    failText: 'No <meta name="viewport"> tag found!',
    regex: /<meta\b[^>]*name=\s*['"]viewport['"]/i,
  },
  {
    name: "Meta Charset",
    group: "Meta-Data",
    failText: "No <meta charset> tag found!",
    regex: /<meta\b[^>]*charset=/i,
  },
  {
    name: "Meta Robots",
    group: "Meta-Data",
    failText: 'No <meta name="robots"> tag found!',
    regex: /<meta\b[^>]*name=\s*['"]robots['"]/i,
  },
  {
    name: "Canonical Link",
    group: "Meta-Data",
    failText: 'No <link rel="canonical"> tag found!',
    regex: /<link\b[^>]*rel=\s*['"]canonical['"]/i,
  },
  {
    name: "Favicons",
    group: "Meta-Data",
    failText: "No favicon or related icons found!",
    regex:
      /<link\b[^>]*rel=\s*['"](?:icon|apple-touch-icon|shortcut icon|manifest)['"]|<meta\b[^>]*name=\s*['"]msapplication-TileImage['"]/i,
  },
  {
    name: "Inline Schema.org",
    group: "Schema.org",
    failText: "No itemscope+itemtype attributes found!",
    regex: /<[^>]+itemscope[^>]+itemtype=/i,
  },
  {
    name: "JSON-LD Schema",
    group: "Schema.org",
    failText: 'No <script type="application/ld+json"> found!',
    regex: /<script\b[^>]*type=\s*['"]application\/ld\+json['"]/i,
  },
  {
    name: "OG Title",
    group: "Social-Media Tags",
    failText: "No Open Graph title (og:title) tag found!",
    regex: /<meta\b[^>]*property=\s*['"]og:title['"]/i,
  },
  {
    name: "OG Description",
    group: "Social-Media Tags",
    failText: "No Open Graph description (og:description) tag found!",
    regex: /<meta\b[^>]*property=\s*['"]og:description['"]/i,
  },
  {
    name: "OG Image",
    group: "Social-Media Tags",
    failText: "No Open Graph image (og:image) tag found!",
    regex: /<meta\b[^>]*property=\s*['"]og:image['"]/i,
  },
  {
    name: "Twitter Card",
    group: "Social-Media Tags",
    failText: "No Twitter card (twitter:card) tag found!",
    regex: /<meta\b[^>]*name=\s*['"]twitter:card['"]/i,
  },
  {
    name: "Twitter Title",
    group: "Social-Media Tags",
    failText: "No Twitter title (twitter:title) tag found!",
    regex: /<meta\b[^>]*name=\s*['"]twitter:title['"]/i,
  },
  {
    name: "Twitter Description",
    group: "Social-Media Tags",
    failText: "No Twitter description (twitter:description) tag found!",
    regex: /<meta\b[^>]*name=\s*['"]twitter:description['"]/i,
  },
  {
    name: "Frameset",
    group: "Misc",
    failText: "Framesets are present!",
    // We want to test for the absence of a frameset.
    test: (file, content) => !/<frameset\b/i.test(content),
  },
  {
    name: "Robots.txt",
    group: "Misc",
    failText: "No robots.txt found!",
    test: (file) => path.basename(file) === "robots.txt",
  },
  {
    name: "Alt-Tags",
    group: "Images",
    failText: "Missing alt text in: {file}",
    aggregate: (file, content) => {
      let hasMissingAlt = false;

      // Images via Cheerio
      const $ = Cheerio.load(content);
      $("img").each((_, el) => {
        if (hasMissingAlt) {
          return;
        }

        const alt = $(el).attr("alt");

        hasMissingAlt = alt === undefined || alt === "";
      });

      return hasMissingAlt;
    },
  },
];

const program = new Command();

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
    const entries = await fg(
      ["**/*.html", "**/*.twig", "**/*.php", "**/robots.txt"],
      {
        cwd: base,
        onlyFiles: true,
        dot: true,
        absolute: true,
      },
    );
    const files = entries.filter((f) => {
      const rel = path.relative(base, f);
      return ig.filter([rel]).length > 0;
    });
    if (files.length === 0) {
      console.log(chalk.yellow("⚠️ No files found for analysis."));
      process.exit(1);
    }

    // Scan files
    files.forEach((file) => {
      let content;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        return;
      }
      const rel = path.relative(base, file);

      tests.forEach((test) => {
        // Skip passed tests
        if (test.hasPassed && !test.aggregate) {
          return;
        }

        // Check for aggregate tests.
        if (test.aggregate) {
          if (!test.failedFiles) {
            test.hasPassed = true;
            test.failedFiles = [];
          }

          if (test.aggregate(file, content)) {
            test.hasPassed = false;
            test.failedFiles.push(file);
          }

          return;
        }

        // Check for test by callback.
        if (test.test) {
          test.hasPassed = test.test(file, content);
          return;
        }

        // Check for test by regex
        if (test.regex) {
          test.hasPassed = test.regex.test(content);

          return;
        }
      });
    });

    // Output
    console.log(`SEO Checker by Jan-Luca Klees`);
    console.log(``);
    console.log(`Check Results:`);

    // Output helpers
    const pass = chalk.green("✅");
    const warn = chalk.yellow("⚠️");
    const fail = chalk.red("❌");

    const groups = new Set(tests.map((test) => test.group));

    groups.forEach((groupName) => {
      const groupTests = tests.filter((test) => test.group === groupName);
      const hasGroupPassed = groupTests.every((test) => test.hasPassed);
      const hasGroupFailed = groupTests.every((test) => !test.hasPassed);

      console.log(
        `  ${hasGroupPassed ? pass : hasGroupFailed ? fail : warn} ${groupName}`,
      );

      if (!hasGroupPassed) {
        groupTests.forEach((test) => {
          if (test.hasPassed) {
            console.log(`    ${pass} ${test.name}`);
          } else {
            if (test.aggregate) {
              test.failedFiles.forEach((file) => {
                console.log(
                  `    ${fail} ${test.failText.replace("{file}", file)}`,
                );
              });
            } else {
              console.log(`    ${fail} ${test.failText}`);
            }
          }
        });
      }
    });
  });

program.parseAsync(process.argv);
