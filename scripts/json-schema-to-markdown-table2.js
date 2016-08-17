/* Forked from https://github.com/clark800/json-schema-to-markdown
 * Copyright (c) 2015, Ripple Labs
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 */
/* eslint no-use-before-define: [2, "nofunc"] */
'use strict'
const fs = require('fs')
const join = require('path').join
// const dirname = require('path').dirname

// rows are represented as an array of three strings: name, type, description
function includes (array, item) {
  return array && array.indexOf(item) !== -1
}

function flatten (arrays) {
  return [].concat.apply([], arrays)
}

function formatTable (rows) {
  const header = ['Name', 'Type', 'Description']
  const divider = ['----', '----', '-----------']
  const allRows = [header, divider].concat(rows)
  return allRows.map(row => row.join(' | ')).join('\n')
}

function formatName (path) {
  if (path.length === 0) {
    return ''
  }
  if (path.length === 1) {
    return path[0]
  }
  return '*' + path.slice(0, -1).join('.') + '.* ' + path.slice(-1)[0]
}

function formatType (schema) {
  if (schema.link) {
    const prefix = includes(schema.link, '://') ? '' : '#'
    return '[' + schema.title + '](' + prefix + schema.link + ')'
  }
  if (schema.format) {
    return schema.format + ' string'
  }
  if (schema.pattern) {
    return 'string'
  }
  if (schema.enum) {
    return 'string'
  }
  return schema.type || 'object'
}

function formatRow (schema, path, isRequired, typeOverride) {
  const description = (isRequired ? '' : '*Optional* ') +
                    (schema.description || '')
  return [formatName(path), typeOverride || formatType(schema), description]
}

function sortKeys (keys, requiredKeys) {
  const result = requiredKeys ? requiredKeys.slice() : []
  result.forEach(key => {
    if (!includes(keys, key)) {
      throw new Error('Property in "required" not in "properties": ' + key)
    }
  })
  keys.sort().forEach(key => {
    if (!includes(result, key)) {
      result.push(key)
    }
  })
  return result
}

function generateRowsForObject (schema, path, schemas, isRequired) {
  const keys = sortKeys(Object.keys(schema.properties), schema.required)
  const rows = flatten(keys.map(name => {
    const isRequiredField = includes(schema.required, name)
    return generateRowsForSchema(
      schema.properties[name], path.concat([name]), schemas, isRequiredField)
  }))
  return path.length > 0 ? [formatRow(schema, path, isRequired)].concat(rows) : rows
}

function generateRowsForArray (schema, path, schemas, isRequired) {
  const newPath = path.slice(0, -1).concat([path.slice(-1)[0] + '[]'])
  const rows = generateRowsForSchema(schema.items, newPath, schemas, true)
  if (rows.length === 1) {
    const typeOverride = 'array\\[' + rows[0][1] + '\\]'
    return [formatRow(schema, path, isRequired, typeOverride)]
  }
  const firstRow = formatRow(schema, path, isRequired)
  return [firstRow].concat(rows)
}

function removeDuplicates (rows) {
  const hash = {}
  const result = []
  rows.forEach(row => {
    const key = row.join('|')
    if (!hash[key]) {
      result.push(row)
      hash[key] = true
    }
  })
  return result
}

function overrideDescription (schema, description) {
  const override = description ? {description: description} : {}
  return assign(assign({}, schema), override)
}

function generateRowsForBranch (branchSchemas, path, description, schemas,
    isRequired) {
  const nonNullSchemas = branchSchemas.filter(schema => schema.type !== 'null')
  const rows = flatten(nonNullSchemas.map(branchSchema =>
    generateRowsForSchema(overrideDescription(branchSchema, description),
      path, schemas, isRequired)))
  const result = removeDuplicates(rows)
  const hasNull = (nonNullSchemas.length < branchSchemas.length)
  if (hasNull) {
    for (var i = 0; i < result.length; i++) {
      result[i][1] = result[i][1] + ', null'
    }
  }
  return result
}

function generateRowsForCompleteSchema (schema, path, schemas, isRequired) {
  if (schema.link && path.length > 0) {
    return [formatRow(schema, path, isRequired)]
  }
  if (schema.type === 'array') {
    if (path.length > 0) {
      return generateRowsForArray(schema, path, schemas, isRequired)
    }
    return generateRowsForSchema(schema.items, path, schemas, true)
  }
  if (schema.properties) {
    return generateRowsForObject(schema, path, schemas, isRequired)
  }
  if (schema.additionalProperties) {
    return generateRowsForSchema(schema.additionalProperties,
      path.concat('\\*'), schemas, isRequired)
  }
  if (schema.oneOf) {
    return generateRowsForBranch(schema.oneOf, path, schema.description,
      schemas, isRequired)
  }
  if (schema.anyOf) {
    return generateRowsForBranch(schema.anyOf, path, schema.description,
      schemas, isRequired)
  }
  return [formatRow(schema, path, isRequired)]
}

function assign (destination, source) {
  for (let key in source) { // eslint-disable-line
    if (source.hasOwnProperty(key)) {
      destination[key] = source[key]
    }
  }
  return destination
}

function completeSchema (schema, schemas) {
  if (schema.$ref) {
    const refSchema = schemas[schema.$ref]
    if (!refSchema) {
      throw new Error('Could not find schema for: ' + schema.$ref)
    }
    return assign(assign({}, refSchema), schema)
  }
  return schema
}

function generateRowsForSchema (schema, path, schemas, isRequired) {
  const completedSchema = completeSchema(schema, schemas)
  return generateRowsForCompleteSchema(completedSchema, path, schemas,
    isRequired)
}

function recursivelyListDirectory (directory) {
  const filenames = fs.readdirSync(directory)
  let results = []
  filenames.forEach(filename => {
    const filepath = join(directory, filename)
    const stat = fs.statSync(filepath)
    if (stat && stat.isDirectory()) {
      results = results.concat(recursivelyListDirectory(filepath))
    } else {
      results.push([filename, filepath])
    }
  })
  return results
}

function loadSchema (filepath) {
  return JSON.parse(fs.readFileSync(filepath))
}

function loadSchemas (schemaDirectory) {
  const filepaths = recursivelyListDirectory(schemaDirectory)
  const schemas = {}
  filepaths.forEach(fpair => {
    let [filename, filepath] = fpair
    if (filepath.endsWith('.json')) {
      const schema = loadSchema(filepath)
      schemas[filename] = schema
    }
  })
  return schemas
}

function render (schema, schemas) {
  return formatTable(generateRowsForSchema(schema, [], schemas || {}, true))
}

function renderFromPaths (schemaPath, schemasPath) {
  return render(loadSchema(schemaPath), loadSchemas(schemasPath))
}

module.exports.render = render
module.exports.renderFromPaths = renderFromPaths
