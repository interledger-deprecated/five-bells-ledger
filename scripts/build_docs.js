#!/usr/bin/env node
/* Forked from https://github.com/ripple/ripple-lib/blob/develop/scripts/build_docs.js
 * Copyright (c) 2012-2015 Ripple Labs Inc.
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 */

'use strict'
const fs = require('fs')
const path = require('path')
// const execSync = require('child_process').execSync;
const ejs = require('ejs')
const renderFromPaths =
  require('./json-schema-to-markdown-table2.js').renderFromPaths
const ROOT = path.dirname(path.normalize(__dirname))

// function strip(string) {
//   return string.replace(/^\s+|\s+$/g, '');
// }
//
// function importFile(relativePath) {
//   const absolutePath = path.join(ROOT, relativePath);
//   return strip(fs.readFileSync(absolutePath).toString('utf-8'));
// }

// function renderFixture(fixtureRelativePath) {
//   const json = importFile(path.join('test', 'fixtures', fixtureRelativePath));
//   return '\n```json\n' + json + '\n```\n';
// }

function renderSchema (schemaRelativePath) {
  const schemasPath = path.join(path.dirname(require.resolve('five-bells-shared')), 'schemas')
  const schemaPath = path.join(schemasPath, schemaRelativePath)
  return renderFromPaths(schemaPath, schemasPath)
}

function main () {
  const locals = {
//    importFile: importFile,
//    renderFixture: renderFixture,
    renderSchema: renderSchema
  }

  const introDocPath = path.join(ROOT, 'docs', 'apidoc_intro.ejs.md')
  ejs.renderFile(introDocPath, locals, function (error, output) {
    if (error) {
      console.error(error)
      process.exit(1)
    } else {
      const outputPath = path.join(ROOT, 'apidoc-out', 'apidoc_intro.md')
      try {
        fs.mkdirSync('apidoc-out')
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
      }
      fs.writeFileSync(outputPath, output)
      // execSync('npm run apidoc', {cwd: ROOT});
      process.exit(0)
    }
  })
}

main()
