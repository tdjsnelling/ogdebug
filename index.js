const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const fs = require('fs')
const http = require('http')

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

  const ogTags = tags.filter(x => x.property.includes('og:'))
  buildReport(ogTags)
}

const buildReport = tags => {
  const card = `
    <div style="width:500px;background:#f0f0f0;border:1px solid #666">
      <img src=${tags.filter(x => x.property === 'og:image')[0] ? tags.filter(x => x.property === 'og:image')[0].content : undefined} style="width:500px" />
      <h1>${tags.filter(x => x.property === 'og:title')[0].content}</h1>
      <p>${tags.filter(x => x.property === 'og:description')[0].content}</p>
    </div>
  `

  let table = ''
  tags.forEach((tag, i) => {
    table += `<tr><td><code>${tag.property}</code></td><td>${tag.content}</td></tr>`
  })
  table = `<table>${table}</table>`

  const html = card + '<br />' + table

  http.createServer((request, response) => {
    response.writeHeader(200, {"Content-Type": "text/html"})
    response.write(html)
    response.end()
  }).listen(8080)

  console.log('report available at http://localhost:8080')
}
