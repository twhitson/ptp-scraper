const puppeteer = require('puppeteer');
const axios = require('axios');
const config = require('./config.json');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
  })
  let grabbed = JSON.parse(fs.readFileSync('grabbed.json'))
  let embeds = []

  const page = await browser.newPage()

  await page.setUserAgent(config.useragent)

  await page.goto('https://passthepopcorn.me')

  await page.type('#username', config.username)
  await page.type('#password', config.password)

  await page.click('#login-button')
  await page.waitForNavigation()

  await page.goto(config.url)
  
  let pageData = await page.evaluate(() => PageData)
  pageData.Movies.forEach(movie => {
    movie.GroupingQualities.forEach(quality => {
      quality.Torrents.forEach(torrent => {
        if (grabbed.grabbed.includes(torrent.TorrentId)) return;

        if (parseInt(torrent.Leechers) > 10) {

          embeds.push({
            title: torrent.ReleaseName,
            description: movie.Title + '\n' + torrent.Title.replace(/<\/?[^>]+(>|$)/g, "").replace("&#9745;", "").trim(),
            url: 'https://passthepopcorn.me/torrents.php?id=' + movie.GroupId + '&torrentid=' + torrent.TorrentId,
            fields: [
              { name: 'Size', value: torrent.Size, inline: true },
              { name: 'Snatches', value: torrent.Snatched, inline: true },
              { name: 'Seeders', value: torrent.Seeders, inline: true },
              { name: 'Leechers', value: torrent.Leechers, inline: true }
            ]
          })

          grabbed.grabbed.push(torrent.TorrentId)
        }
      })
    })
  })

  await browser.close()

  if (embeds.length === 0) return;

  axios.post(config.webhook, {
    content: '',
    embeds: embeds
  })
  .then(res => { console.log(embeds) })
  .catch(err => { console.error(err) })

  fs.writeFileSync('grabbed.json', JSON.stringify(grabbed))
})()