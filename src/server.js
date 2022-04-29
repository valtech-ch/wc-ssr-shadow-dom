import express from 'express'
import { convertRawHTMLToDOMTree, getPageFromCMS } from './cms-service.js'

const server = express()

server.get('/', async (req, res) => {

    const htmlFromCMS = await getPageFromCMS();

    const rendered = await convertRawHTMLToDOMTree(htmlFromCMS);

    console.log('rendered', rendered);

    res.send(rendered);
});

server.use(express.static('.'))

server.listen(3000, () => {
  console.log('ready')
})

// prerender with puppeteer
