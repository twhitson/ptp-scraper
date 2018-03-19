const request = require('request').defaults({ jar: true })
const config = require('./config.json')
const fs = require('fs')

let grabbed = JSON.parse(fs.readFileSync('grabbed.json'))
let embeds = []
let pageData = {}

login()

function login() {
  request({
    method: 'POST',
    uri: 'https://passthepopcorn.me/ajax.php?action=login',
    form: {
      username: config.username,
      password: config.password,
      passkey: config.passkey,
      keeplogged: '0',
      login: 'Login In!'
    }
  }, (err, res, body) => {
    if (err) return console.error(err)

    getPageData()
  })
}

function getPageData() {
  request({
    uri: 'https://passthepopcorn.me/torrents.php?freetorrent=1&grouping=0&json=noredirect'
  }, (err, res, body) => {
    if (err) return console.error(err)

    try {
      pageData = JSON.parse(body)
    } catch (e) {
      return console.warn('PageData is not JSON. Are your credentials correct?')
    }

    findGoodTorrents()
  })
}

function findGoodTorrents() {
  if (!pageData.Movies) return console.warn('PageData empty')

  pageData.Movies.forEach(movie => {
    movie.Torrents.forEach(torrent => {
      if (grabbed.grabbed.includes(torrent.TorrentId)) return;

      if (parseInt(torrent.Leechers) > 10) {

        embeds.push({
          title: torrent.ReleaseName,
          description: `${movie.Title} (${movie.Year})`,
          url: 'https://passthepopcorn.me/torrents.php?id=' + movie.GroupId + '&torrentid=' + torrent.TorrentId,
          fields: [
            { name: 'Size', value: formatBytes(torrent.Size), inline: true },
            { name: 'Snatches', value: torrent.Snatched, inline: true },
            { name: 'Seeders', value: torrent.Seeders, inline: true },
            { name: 'Leechers', value: torrent.Leechers, inline: true }
          ]
        })

        grabbed.grabbed.push(torrent.TorrentId)
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

  fs.writeFileSync('grabbed.json', JSON.stringify(grabbed))
}

function formatBytes(a, b) { if (0 == a) return "0 Bytes"; var c = 1024, d = b || 2, e = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], f = Math.floor(Math.log(a) / Math.log(c)); return parseFloat((a / Math.pow(c, f)).toFixed(d)) + " " + e[f] }
