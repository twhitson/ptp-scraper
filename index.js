const config = require('./config.json')
const fs = require('fs')
let request = require('request')

let grabbed = { grabbed: [] }
if (fs.existsSync(config.files.grabbed)) {
  try { grabbed = JSON.parse(fs.readFileSync(config.files.grabbed)) }
  catch (e) { console.error(e) }
}

if (!fs.existsSync(config.files.cookies)) {
  fs.closeSync(fs.openSync(config.files.cookies, 'w'));
}

const FileCookieStore = require('tough-cookie-filestore')
const jar = request.jar(new FileCookieStore(config.files.cookies))

request = request.defaults({ jar: jar })

let embeds = []
let pageData = {}
let retryCount = 0

getPageData()

function getPageData() {
  request({
    uri: config.url
  }, (err, res, body) => {
    if (err) return console.error(err)

    try {
      pageData = JSON.parse(body)

      if (!pageData.Movies) {
        login()
        return
      }
    } catch (e) {
      login()
      return
    }

    filterGoodTorrents()
  })
}

function login() {
  if (retryCount > 1)
    return console.warn('Unable to get data. Are your credentials correct?')

  request({
    method: 'POST',
    uri: 'https://passthepopcorn.me/ajax.php?action=login',
    form: {
      username: config.username,
      password: config.password,
      passkey: config.passkey,
      keeplogged: '1',
      login: 'Login In!'
    }
  }, (err, res, body) => {
    if (err) return console.error(err)

    console.log('Logging in')
    retryCount++
    getPageData()
  })
}

function filterGoodTorrents() {
  pageData.Movies.forEach(movie => {
    movie.Torrents.forEach(torrent => {
      if (grabbed.grabbed.includes(torrent.Id)) {
        console.log(`Skipping [${torrent.Id}] ${torrent.ReleaseName}`)
        return
      }

      const seeders = parseInt(torrent.Seeders),
        leechers = parseInt(torrent.Leechers),
        snatched = parseInt(torrent.Snatched)

      if (leechers > 10
        || (leechers > seeders && seeders > 0)) {
        embeds.push({
          title: torrent.ReleaseName,
          description: `${movie.Title} (${movie.Year})`,
          url: 'https://passthepopcorn.me/torrents.php?id=' + movie.GroupId + '&torrentid=' + torrent.Id,
          fields: [
            { name: 'Size', value: formatBytes(torrent.Size), inline: true },
            { name: 'Snatches', value: snatched, inline: true },
            { name: 'Seeders', value: seeders, inline: true },
            { name: 'Leechers', value: leechers, inline: true }
          ]
        })
        console.log(`Sending [${torrent.Id}] ${torrent.ReleaseName}`)

        grabbed.grabbed.push(torrent.Id)
      }
    })
  })

  sendWebhook()
}

function sendWebhook() {
  if (embeds.length === 0) return

  request({
    uri: config.webhook,
    method: 'POST',
    json: {
      content: '',
      embeds: embeds
    }
  }, (err, res, body) => {
    if (err) return console.error(err)
  })

  fs.writeFileSync(config.files.grabbed, JSON.stringify(grabbed), { flag: 'w' })
}

function formatBytes(a, b) { if (0 == a) return "0 Bytes"; var c = 1024, d = b || 2, e = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], f = Math.floor(Math.log(a) / Math.log(c)); return parseFloat((a / Math.pow(c, f)).toFixed(d)) + " " + e[f] }
