const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const fs = require('fs')
const http = require('http')
const opn = require('opn')

const url = process.argv[2]

if (!url) {
  throw 'No url provided.'
}

puppeteer.launch().then(async browser => {
  const page = await browser.newPage()
  page.setJavaScriptEnabled(true)
  await page.goto(url, { waitUntil: 'networkidle2' })

  const renderedContent = await page.evaluate(() => new XMLSerializer().serializeToString(document))
  parseHtml(renderedContent)

  browser.close()
})

const parseHtml = html => {
  const $ = cheerio.load(html)
  const meta = $('meta')
  let tags = []

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

  const ogTags = tags.filter(x => x.property.includes('og:') || x.property.includes('twitter:'))
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
        <h2>${getContent(tags, 'og:title')}</h2>
        <p>${getContent(tags, 'og:description')}</p>
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
    </style>
    <h1>Open Graph report</h1>
    <h3>Preview (Facebook)</h3>
    ${card}
    <h3>Data</h3>
    ${table}
  `

  http.createServer((request, response) => {
    response.writeHeader(200, {"Content-Type": "text/html"})
    response.write(html)
    response.end()
  }).listen(8080)

  console.log('report available at http://localhost:8080')
  opn('http://localhost:8080')
}
