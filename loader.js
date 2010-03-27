var sys = require('sys'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    http = require('http');

var YUI = require("../nodejs-yui3/lib/node-yui3").YUI;

YUI({
    loaderPath: 'loader/loader-debug.js',
    base: './yui3/build/',
    filter: 'debug',
    debug: true
}).use('loader', 'oop', function(Y) {


    var getModules = function(keys) {
        if (keys[0] && keys[0].indexOf('.js') !== -1) {
            return Y.Object(keys);
        }
        var loader = new Y.Loader({
            require: keys,
            force: keys.concat("yui", "yui-base", "get", "yui-log", "yui-later", "loader", 'oop', 'yui-throttle', 'intl'),
            allowRollup: true, 
            filter: 'debug',
            loadOptional: false,
            combine: false
        });

        loader.base = Y.config.base;
        loader.calculate();

        var s = loader.sorted, l = s.length, m, surl, out = [], i;

        if (l) {
            for (i=0; i <l; i=i+1)  {
                m = loader.moduleInfo[s[i]];
                if (m && m.type == 'js') {
                    surl = m.fullpath || loader._url(m.path);
                    out.push(surl);
                }
            }
        }
        return out;
    };

    var getKeys = function(req) {
        var urlInfo = url.parse(req.url, true);
        //sys.print(sys.inspect(urlInfo));

        if (urlInfo.search && urlInfo.search.indexOf(';') !== -1) {
            var tKeys = urlInfo.search.substr(1).split(';');
            urlInfo.query = {};
            Y.each(tKeys, function(v) {
                urlInfo.query[v] = '';
            });
        }

        var keys = Y.Object.keys(urlInfo.query),
            default_keys = ['yui', 'yui-base', 'get', 'loader'];
        
        if (urlInfo.search && urlInfo.search.indexOf('.js') !== -1) {
            sys.puts('We have an old combo url');
            Y.each(keys, function(v, k) {
                var pos = v.indexOf('/build');
                keys[k] = './yui3' + v.substring(pos);
            });
        }
        
        if (keys.length === 0) {
            if (!urlInfo.query) {
                keys = urlInfo.pathname.split('/');
                delete keys[0];
            }
        }
        if (keys.length === 0) {
            keys = default_keys;
        }
        if (req.url == '/') {
            keys = default_keys;
        }
        sys.puts('Keys: ' + sys.inspect(keys));

        return keys;
    }, handleQuick = function(req) {
        var urlInfo = url.parse(req.url, true);
        sys.puts('Handle YUI Quick Mode: ' + urlInfo.pathname);
        var str = '';
        if (urlInfo.pathname === '/quick') {
            str = "\n/*Loading YUI in Quick mode*/\n" + 'Y = YUI().use("*");';
        }
        return str;
    };


    var urls = {},
        fileStrs = {};

    var loaderServer = function (req, res) {
        sys.puts('Serving: ' + req.url);
        if (req.url === '/favicon.ico') {
            res.close();
            return;
        }

        var files = [],
            fileCount = 0,
            keys = getKeys(req),
            out = getModules(keys),
            sent = false,
            sendRequest = function() {
                if (sent) {
                    return;
                }
                sent = true;
                sys.puts('Sending Request');
                var body = files.join("\n\n");
                body += handleQuick(req);

                res.writeHead(200, {
                    'Content-Type': 'application/x-javascript',
                    //'Content-Type': 'text/plain',
                    'Content-Length': body.length,
                    'Cache-Control': 'max-age=315360000',
                    'Vary': 'Accept-Encoding',
                    'Date': new Date(),
                    'Expires': new Date((new Date()).getTime() + (60 * 60 * 1000 * 365 * 10)),
                    'Age': '300',
                    'Connection': 'close',
                    'Accept-Ranges': 'bytes',
                    'Server': 'YUI3 Node.js Combo'
                });
                res.write(body);
                res.close();
            }, throwError = function(err, fileName) {
                sent = true;
                sys.puts('Sending Error');

                var body = 'Error: ' + err + "\n\n" + fileName;

                res.writeHead(500, {
                    'Content-Type': 'text/plain',
                    'Content-Length': body.length,
                    'Date': new Date(),
                    'Connection': 'close',
                    'Server': 'YUI3 Node.js Combo'
                });
                res.write(body);
                res.close();
            };


        Y.each(out, function(v, k) {
            //This assumes the nodejs-yui3 module is here..
            f = path.join('../nodejs-yui3/lib/', v);

            //sys.puts('Loading File from disk (' + k + '): ' + f);
            fs.readFile(f, encoding="utf8", Y.rbind(function(err, data, index, fileName) {
                fileCount++;
                //sys.puts('File Loaded from disk (' + index + '): ' + out[index]);
                files[index] = data;
                if (err) {
                    throwError(err, f);
                }
                if (fileCount == out.length) {
                    //Files are all done
                    sendRequest();
                }
            }, Y, k, f));
        });

    };


    var defaultPort = 8000, i,
        numServers = 1;

    for (i = defaultPort; i < (defaultPort + numServers); i++) {
        http.createServer(loaderServer).listen(i);
        sys.puts('Server running at http:/'+'/127.0.0.1:' + i + '/');
    }
});
