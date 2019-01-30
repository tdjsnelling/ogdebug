#!/usr/bin/env node
const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const fs = require('fs')
const http = require('http')
const opn = require('opn')
const ArgumentParser = require('argparse').ArgumentParser

const argparse = new ArgumentParser({
  addHelp: true,
  description: 'Create Open Graph reports and sharing previews for sites running on your localhost'
})

argparse.addArgument([ '-p', '--port' ], {
  help: 'The port to run the report server on.'
})
argparse.addArgument([ '-u', '--url' ], {
  help: 'The URL to test.',
  required: true
})
argparse.addArgument([ '-s', '--save' ], {
  help: 'Whether the report should be saved to a HTML file.',
  const: true,
  nargs: 0
})

const args = argparse.parseArgs()

console.log('generating report...')

puppeteer.launch().then(async browser => {
  const page = await browser.newPage()
  page.setJavaScriptEnabled(true)
  await page.goto(args.url, { waitUntil: 'networkidle2' })

  const renderedContent = await page.evaluate(() => new XMLSerializer().serializeToString(document))
  parseHtml(renderedContent)

  browser.close()
})

const parseHtml = html => {
  const $ = cheerio.load(html)
  const meta = $('meta')
  let tags = []

  tags.push({
    property: 'title',
    content: $('title').text()
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

  const ogTags = tags.filter(x => x.property.includes('og:')
    || x.property.includes('twitter:')
    || x.property === 'title'
    || x.property === 'description'
  )
  buildReport(ogTags)
}

const getContent = (tags, property) => {
  return tags.filter(x => x.property === property)[0] ? tags.filter(x => x.property === property)[0].content : undefined
}

const buildReport = tags => {
  const card = `
    <div style="width:500px;background:#f0f0f0;border:1px solid #666">
      <img src=${getContent(tags, 'og:image')} style="width:500px" />
      <div style="padding:0 16px">
        <p>${getContent(tags, 'og:url')}</p>
        <h2>${getContent(tags, 'og:title') || `${getContent(tags, 'title')} <span class="inferred">(inferred)</span>`}</h2>
        <p>${getContent(tags, 'og:description') || `${getContent(tags, 'description')} <span class="inferred">(inferred)</span>`}</p>
      </div>
    </div>
  `

  let table = ''
  tags.forEach((tag, i) => {
    table += `<tr><td><code>${tag.property}</code></td><td>${tag.content}</td></tr>`
  })
  table = `<table>${table}</table>`

  const html = `
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
        padding: 4px;
      }
      .inferred {
        color: coral;
        font-size: 12px;
      }
    </style>
    <h1>Open Graph report for <code>${args.url}</code></h1>
    <h3>Preview (Facebook)</h3>
    ${card}
    <h3>Data</h3>
    ${table}
  `

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

  console.log(`report available at http://localhost:${args.port || 8080}`)
  opn(`http://localhost:${args.port || 8080}`)
}
