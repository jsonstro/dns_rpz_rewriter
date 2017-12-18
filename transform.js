var Transform = require('stream').Transform;
var inherits = require('util').inherits;

module.exports = rewrite;

function rewrite(options) {
    if (!(this instanceof rewrite))
        return new rewrite(options);

    this.zone = options.zone;
    this.goal = options.goal;
    var template = [
        '$TTL 60',
        '@            IN    SOA  rpz.    rpz. (',
        '                      __SERIAL__  ; serial',
        '                      3H  ; refresh',
        '                      1H  ; retry',
        '                      1W  ; expiry',
        '                      1H  ; minimum',
        '                      )'
    ].join('\n');
    template += '\n';
    (options.goal.ns || []).forEach(function(ns) {
        template += [' ', 'IN', 'NS', (ns.slice(-1) === '.' ? ns : ns += '.'), '\n'].join(' ')
    })
    this.template = template;

    Transform.call(this, {});
}

inherits(rewrite, Transform);

rewrite.prototype._transform = function _transform(line, encoding, callback) {
    line = line.toString('utf-8').replace(/\s+/g, ' ').split(' ')
    if (line.indexOf('Transfer failed') !== -1) return callback(new Error('Transfer failed.'))
    //             normalize white space    split by white space
    var hostname = line[0].replace('.' + this.zone, '');
    if (hostname.indexOf(this.zone) !== -1) {
        if (line[3] === 'SOA') {
            // we need to capture the serial
            this.push(this.template.replace('__SERIAL__', line[6]))
        }
    }else if (hostname.slice(0, 2) !== '*.') {
        this.push([hostname, ' ', this.goal.type, this.goal.rr, '\n'].join(' '));
        if (this.goal.addWildcard) {
            this.push(['*.' + hostname, ' ', this.goal.type, this.goal.rr, '\n'].join(' '));
        }
    }
    callback()
};
