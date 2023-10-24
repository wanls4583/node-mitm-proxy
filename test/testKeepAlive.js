const http = require('http')

let server = new http.Server()

let socketId = 0

server.keepAliveTimeout = 3000

server.on('request', (req, res) => {
    console.log('lisong', req.socket.id)
    req.socket.id = socketId++
    if (req.url.indexOf('/id') > -1) {
        // res.setHeader('connection', 'close')
        res.write('socketId: ' + socketId)
    } else {
        res.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
        </head>
        <body>
            hello world
            <div id="id"></div>
            <script>
                function getId() {
                    fetch('/id').then(async (res) => {
                        let text = await res.text()
                        document.querySelector('#id').innerHTML += '<br>' + text
                        setTimeout(() => {
                            getId()
                        }, 2000);
                    })
                }
                getId()
            </script>
        </body>
        </html>
        `)
    }
    res.end()
    // req.socket.destroy()
}).listen(8080)


