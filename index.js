#!/usr/bin/env node
const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const fs = require('fs')
const http = require('http')
const opn = require('opn')
const ArgumentParser = require('argparse').ArgumentParser
const ora = require('ora')
const CliTable = require('cli-table')
const pkgJson = require('./package.json')

const argparse = new ArgumentParser({
  version: `v${pkgJson.version}`,
  addHelp: true,
  description: 'Create Open Graph reports and sharing previews for sites running on your localhost.'
})

argparse.addArgument([ '-u', '--url' ], {
  help: 'The URL to test.',
  required: true
})
argparse.addArgument([ '-V', '--visual' ], {
  help: 'Generate a HTML report.',
  const: true,
  nargs: 0
})
argparse.addArgument([ '-s', '--save' ], {
  help: 'Whether the report should be saved to a HTML file. Only applies if -V flag is present.',
  const: true,
  nargs: 0
})
argparse.addArgument([ '-p', '--port' ], {
  help: 'The port to run the report server on. Only applies if -V flag is present.'
})

const args = argparse.parseArgs()

const spinner = ora('generating report...').start()
const timeout = setTimeout(() => {
  spinner.fail('ogdebug timed out.')
  process.exit(1)
}, 20000)

if (!args.url.startsWith('http')) {
  args.url = 'http://' + args.url
}

puppeteer.launch().then(async browser => {
  const page = await browser.newPage()
  page.setJavaScriptEnabled(true)

  try {
    await page.goto(args.url, { waitUntil: 'networkidle2' })
    const renderedContent = await page.evaluate(() => new XMLSerializer().serializeToString(document))
    parseHtml(renderedContent)
  }
  catch (err) {
    spinner.fail(err)
    process.exit(1)
  }

  browser.close()
})

const getLongestParagraph = ($, elements) => {
  let currentLongest = ''

  elements.each((i, el) => {
    if ($(el).text().length > currentLongest.length) {
      currentLongest = $(el).text()
    }
  })

  return currentLongest.slice(0, 155)
}

const parseHtml = html => {
  const $ = cheerio.load(html)
  const meta = $('meta')
  let tags = []

  tags.push({
    property: 'title',
    content: $('title').text()
  })

  tags.push({
    property: 'descriptionFallback',
    content: getLongestParagraph($, $('p, h1, h2, h3, h4, h5, h6'))
  })

  meta.each((i, el) => {
    if ($(el).attr('name')) {
      tags.push({
        property: $(el).attr('name'),
        content: $(el).attr('content')
      })
    }
    else if ($(el).attr('property')) {
      tags.push({
        property: $(el).attr('property'),
        content: $(el).attr('content')
      })
    }
  })

  tags = tags.filter(x =>
    x.property.includes('og:')
    || x.property.includes('twitter:')
    || x.property.includes('fb:')
    || x.property === 'title'
    || x.property === 'description'
    || x.property === 'descriptionFallback'
  )

  if (args.visual) {
    buildHtmlReport(tags)
  }
  else {
    buildCliReport(tags)
  }
}

const getContent = (tags, property) => {
  return tags.filter(x => x.property === property)[0] ? tags.filter(x => x.property === property)[0].content : undefined
}

const getImageFrom = tags => {
  return getContent(tags, 'og:image') ? `<img src=${getContent(tags, 'og:image')} style="width:500px" />` : ''
}

const getHostnameFrom = tags => {
  return getContent(tags, 'og:url') ? (new URL(getContent(tags, 'og:url'))).hostname : `${(new URL(args.url)).hostname} <span class="inferred">(inferred)</span>`
}

const getTitleFrom = tags => {
  return getContent(tags, 'og:title') || `${getContent(tags, 'title')} <span class="inferred">(inferred)</span>`
}

const getDescriptionFrom = tags => {
  const ogDescription = getContent(tags, 'og:description')
  const metaDescription = getContent(tags, 'description')
  const bodyContent = getContent(tags, 'descriptionFallback')

  if (ogDescription) {
    return ogDescription
  }
  else if (metaDescription) {
    return `${metaDescription} <span class="inferred">(inferred)</span>`
  }

  return `${bodyContent.slice(0, 155)} <span class="inferred">(inferred)</span>`
}

const buildCliReport = tags => {
  const table = new CliTable({
    head: [ 'property', 'content' ],
    style: {
      head: [ 'cyan' ]
    }
  })

  tags.forEach((tag, i) => {
    table.push([ tag.property, tag.content ])
  })

  spinner.succeed()
  console.log(`\nOpen Graph report for ${args.url}`)
  console.log(table.toString())
  process.exit(0)
}

const buildHtmlReport = tags => {
  const card = `<div style="width:500px;background:#f0f0f0;border:1px solid #666">
    ${getImageFrom(tags)}
    <div style="padding:0 16px">
      <p>${getHostnameFrom(tags)}</p>
      <h2>${getTitleFrom(tags)}</h2>
      <p>${getDescriptionFrom(tags)}</p>
    </div>
  </div>`

  let table = ''
  tags.forEach((tag, i) => {
    table += `<tr>
      <td><code>${tag.property}</code></td>
      <td>${tag.content}</td>
    </tr>`
  })
  table = `<table>${table}</table>`

  const html = `<html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          font-family: sans-serif;
        }
        table, td, th {
          border: 1px solid #666;
        }
        table {
          border-collapse: collapse;
        }
        td {
          padding: 4px 8px;
        }
        .inferred {
          color: coral;
          font-size: 12px;
        }
      </style>
      <title>ogdebug: ${args.url}</title>
    </head>
    <body>
      <h1>Open Graph report for <code>${args.url}</code></h1>
      <h3>Preview (Facebook)</h3>
        ${card}
      <p><span class="inferred">(inferred)</span> means that a value has been inferred from a less desirable property.</p>
      <h3>Data</h3>
      ${table}
      <p><code>Generated by <a href="https://github.com/tdjsnelling/ogdebug" target="_blank">ogdebug</a> on ${(new Date).toLocaleDateString('en-GB')}</code></p>
    </body>
    </html>`

  if (args.save) {
    if (!fs.existsSync('reports/')) {
      fs.mkdirSync('reports/')
    }

    const filename = args.url.replace(/http(s)?:\/\//g, '').replace(/\//g, '-').replace(/:/g, '-')
    fs.writeFileSync(`reports/${filename}-${Date.now()}.html`, html)
    console.log('saved report to file')
  }

  http.createServer((request, response) => {
    response.writeHeader(200, { "Content-Type": "text/html" })
    response.write(html)
    response.end()
  }).listen(args.port || 8080)

  spinner.succeed()
  clearTimeout(timeout)
  console.log(`report available at http://localhost:${args.port || 8080}`)
  opn(`http://localhost:${args.port || 8080}`)
}
