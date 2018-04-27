const config = require('./config.json')
const fs = require('fs')
const path = require('path')
const Client = require('ssh2').Client
let request = require('request')

let grabbed = { grabbed: [] }
if (fs.existsSync(path.join(__dirname, config.cache.grabbed))) {
  try { grabbed = JSON.parse(fs.readFileSync(path.join(__dirname, config.cache.grabbed))) }
  catch (e) { console.error(e) }
}

if (!fs.existsSync(path.join(__dirname, config.cache.cookies))) {
  fs.closeSync(fs.openSync(path.join(__dirname, config.cache.cookies), 'w'));
}

const FileCookieStore = require('tough-cookie-filestore')
const jar = request.jar(new FileCookieStore(path.join(__dirname, config.cache.cookies)))

request = request.defaults({ jar: jar })

let embeds = []
let downloads = []
let pageData = {}
let retryCount = 0

getPageData()

function getPageData() {
  request(config.ptp.url, (err, res, body) => {
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
      username: config.ptp.username,
      password: config.ptp.password,
      passkey: config.ptp.passkey,
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
        snatched = parseInt(torrent.Snatched),
        permalink = `https://passthepopcorn.me/torrents.php?id=${movie.GroupId}&torrentid=${torrent.Id}`

      if (leechers > 10
        || (leechers > seeders && seeders > 0)) {
        embeds.push({
          title: torrent.ReleaseName,
          description: `${movie.Title} (${movie.Year})`,
          url: permalink,
          fields: [
            { name: 'Size', value: formatBytes(torrent.Size), inline: true },
            { name: 'Snatches', value: snatched, inline: true },
            { name: 'Seeders', value: seeders, inline: true },
            { name: 'Leechers', value: leechers, inline: true }
          ]
        })
        console.log(`Sending [${torrent.Id}] ${torrent.ReleaseName}`)

        grabbed.grabbed.push(torrent.Id)
        downloads.push(torrent)
      }
    })
  })

  sendWebhook()
  uploadTorrents()
}

function sendWebhook() {
  if (!config.webhook) return
  if (embeds.length === 0) return

  let webhook = {
    content: `${pageData.TotalResults} torrents found. ${embeds.length} matched criteria.`,
    embeds: embeds
  }

  request({
    uri: config.webhook,
    method: 'POST',
    json: webhook
  }, (err, res, body) => {
    if (err) return console.error(err)
  })

  fs.writeFileSync(path.join(__dirname, config.cache.grabbed), JSON.stringify(grabbed), { flag: 'w' })
}

function uploadTorrents() {
  if (!config.sftp.host) return
  if (downloads.length === 0) return

  let conn = new Client()

  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) throw err
      let uploaded = 0

      downloads.forEach(torrent => {
        let link = `https://passthepopcorn.me/torrents.php?action=download&id=${torrent.Id}&authkey=${pageData.AuthKey}&torrent_pass=${config.ptp.passkey}`
        let filename = `${torrent.ReleaseName}.torrent`
        let dest = config.cache.torrent.startsWith('/') ? config.cache.torrent : path.join(__dirname, config.cache.torrent, filename)

        request(link)
          .pipe(fs.createWriteStream(dest))
          .on('close', () => {
            let readStream = fs.createReadStream(dest)
            let writeStream = sftp.createWriteStream(config.sftp.path + filename)

            writeStream.on('close', () => {
              console.log(`Uploaded ${filename}`)
              uploaded++

              if (uploaded === downloads.length) {
                console.log('Closing sftp connection')
                conn.end()
              }

              fs.unlinkSync(dest)
            })

            writeStream.on('end', () => {
              console.log('Connection closed')
            })

            readStream.pipe(writeStream)
          })
      })
    })
  }).connect({
    host: config.sftp.host,
    port: config.sftp.port,
    username: config.sftp.username,
    password: config.sftp.password
  })
}

function formatBytes(a, b) { if (0 == a) return "0 Bytes"; var c = 1024, d = b || 2, e = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], f = Math.floor(Math.log(a) / Math.log(c)); return parseFloat((a / Math.pow(c, f)).toFixed(d)) + " " + e[f] }
