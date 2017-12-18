var child = require('child_process'),
    byline = require('byline'),
    fs = require('fs'),
    config = require('./config.json'),
    spawn = require( 'child_process' ).spawn,
    rewrite = require('./transform');

var lock = {};

var log = function(msg) {
    console.log('[' + new Date().toUTCString() + '] ', msg)
}

var logError = function(msg) {
    console.error('[' + new Date().toUTCString() + '] ', msg)
}

var parseAXFRAndRewrite = function(zone, goal, callback) {
    // make sure that we have the trailing dot
    if (zone.slice(-1) !== '.') zone += '.';
    if (goal.rr.slice(-1) !== '.') goal.rr += '.';

    // dig +nocmd +nostats axfr @65.49.34.155 rpz.spamhaus.org.
    var dig = child.spawn('dig', ['+nocmd', '+nostats', 'axfr', '@' + config.via, zone]);

    var readByLine = byline.createStream(dig.stdout)

    readByLine.on('end', callback)

    var rewriteSteam = readByLine.pipe(rewrite({
        zone: zone,
        goal: goal
    }))

    rewriteSteam.on('error', callback);

    var saveStream = rewriteSteam.pipe(fs.createWriteStream(goal.file))
}

Object.keys(config.rewrite).forEach(function(srcZone) {
    log('Watching for ' + srcZone)
    fs.watchFile(config.rewrite[srcZone].watch, {
        persistent: true,
        interval: config.rewrite[srcZone].interval * 60 * 1000 // given in minutes
    }, function(curr, prev) {
        log('Changes to ' + srcZone + ' detected.')
        if (lock[srcZone] === true) {
            logError('Cannot acquire lock for ' + srcZone)
            return;
        }
        lock[srcZone] = true;
        parseAXFRAndRewrite(srcZone, config.rewrite[srcZone], function(err) {
            lock[srcZone] = false;
            if (err) {
                logError(err);
            }else{
                var reload;
                // WARNING: This does not provide sanity check
                // The script assumes that the config file is sanitized
                if (config.rewrite[srcZone].rndc) {
                    reload = spawn('rndc', ['reload', config.rewrite[srcZone].rndc])
                }else{
                    reload = spawn('true')
                }
                reload.on('close', function(code) {
                    log(srcZone + ' updated. reload command exited with code ' + code)
                })
            }
        })
    })
})
