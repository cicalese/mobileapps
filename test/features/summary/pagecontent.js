'use strict';

const preq = require('preq');
const assert = require('../../utils/assert.js');
const headers = require('../../utils/headers.js');
const server = require('../../utils/server.js');

describe('summary', function() {

    this.timeout(20000); // eslint-disable-line no-invalid-this

    before(() => { return server.start(); });

    const localUri = (title, domain = 'en.wikipedia.org') => {
        return `${server.config.uri}${domain}/v1/page/summary/${title}`;
    };

    it('should respond to GET request with expected headers, incl. CORS and CSP headers', () => {
        const uri = localUri('Foobar');
        return headers.checkHeaders(uri);
    });

    it('should respond with expected properties in payload', () => {
        const uri = localUri('Foobar/798652007');
        return preq.get({ uri })
            .then((res) => {
                assert.deepEqual(res.status, 200);
                assert.deepEqual(res.body.type, 'standard');
                assert.deepEqual(res.body.revision, 798652007);
                assert.deepEqual(res.body.titles.canonical, "Foobar");
                assert.deepEqual(res.body.titles.normalized, "Foobar");
                assert.deepEqual(res.body.titles.display, "Foobar");
                assert.ok(res.body.extract.indexOf('foobar') > -1);
                assert.ok(res.body.extract_html.indexOf('<b>foobar</b>') > -1);
            });
    });
});
